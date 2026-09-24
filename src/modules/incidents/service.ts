import { recordAudit } from '@/server/authorize';
import { DomainError } from '@/shared/result';
import { canSuspend, canTransition, type IncidentSeverity } from './domain/incidents';
import { logger } from '@/platform/observability/logger';
import { notificationsService } from '@/modules/notifications/service';
import { incidentsRepository, type IncidentDetail } from './repository';

/**
 * Triage actions — the rules behind Screen A06.
 *
 * Every action is audited with its before and after state. Suspension and
 * reinstatement additionally write a row against the listing itself, so the
 * listing's own history shows when it went down and why (PRD E09-S07).
 */

export type IncidentAction =
  | { action: 'assign'; assignedTo: string | null }
  | { action: 'set_severity'; severity: IncidentSeverity; reason: string }
  | { action: 'investigate' }
  | { action: 'suspend'; reason: string }
  | { action: 'reinstate'; reason: string }
  | { action: 'resolve'; reason: string }
  | { action: 'dismiss'; reason: string }
  | { action: 'reopen'; reason: string };

const conflict = (message: string, actions?: string[]): DomainError =>
  new DomainError('incident.conflict', message, 409, actions);

export const incidentsService = {
  async act(
    incidentId: string,
    command: IncidentAction,
    actorUserId: string,
    requestId?: string,
  ): Promise<IncidentDetail> {
    const incident = await incidentsRepository.findById(incidentId);
    if (incident === null) throw new DomainError('incident.not_found', 'That report does not exist.', 404);

    const audit = (
      action: string,
      before: unknown,
      after: unknown,
      entityId: string = incident.id,
      entityType = 'incident_report',
    ) => recordAudit({ actorUserId, action, entityType, entityId, beforeState: before, afterState: after, requestId });

    switch (command.action) {
      case 'assign': {
        await incidentsRepository.setAssignee(incident.id, command.assignedTo);
        await audit('incident.assigned', { assignedTo: incident.assignedTo }, { assignedTo: command.assignedTo });
        break;
      }

      case 'set_severity': {
        await incidentsRepository.setSeverity(incident.id, command.severity);
        await audit(
          'incident.severity_changed',
          { severity: incident.severity },
          { severity: command.severity, reason: command.reason },
        );
        break;
      }

      case 'investigate': {
        if (!canTransition(incident.status, 'investigating')) {
          throw conflict(`A ${incident.status} report cannot move to investigating.`);
        }
        await incidentsRepository.setStatus(incident.id, 'investigating', null);
        await audit('incident.investigating', { status: incident.status }, { status: 'investigating' });
        break;
      }

      case 'suspend': {
        if (!canSuspend(incident.severity)) {
          throw conflict(
            'Immediate suspension is for high or critical reports. Raise the severity first, with a reason, if this report warrants it.',
            ['set_severity'],
          );
        }
        if (incident.entityStatus === 'suspended') throw conflict('This listing is already suspended.');

        await incidentsRepository.suspendEntity(incident);
        await audit('incident.suspended_listing', { entityStatus: incident.entityStatus }, { reason: command.reason });
        // A suspension is the safety case notifications exist for: it reaches
        // travellers with this stop in a plan, quiet hours or not.
        await notifyTravellers(incident, command.reason);
        await audit(
          `${incident.entityType}.suspended`,
          { status: incident.entityStatus },
          { status: 'suspended', incidentId: incident.id, reason: command.reason },
          incident.entityId,
          incident.entityType,
        );
        break;
      }

      case 'reinstate': {
        if (incident.entityStatus !== 'suspended') throw conflict('This listing is not suspended.');

        // Another open report may have independent grounds for keeping the
        // listing down. Reinstating from this one would silently override it.
        const others = await incidentsRepository.otherActiveSuspensions(incident);
        if (others > 0) {
          throw conflict(
            others === 1
              ? 'Another open report keeps this listing suspended. Resolve it first.'
              : `${others} other open reports keep this listing suspended. Resolve them first.`,
          );
        }

        await incidentsRepository.reinstateEntity(incident);
        await audit('incident.reinstated_listing', { entityStatus: 'suspended' }, { reason: command.reason });
        await audit(
          `${incident.entityType}.reinstated`,
          { status: 'suspended' },
          { status: 'active', incidentId: incident.id, reason: command.reason },
          incident.entityId,
          incident.entityType,
        );
        break;
      }

      case 'resolve':
      case 'dismiss':
      case 'reopen': {
        const next = command.action === 'resolve' ? 'resolved' : command.action === 'dismiss' ? 'dismissed' : 'open';
        if (!canTransition(incident.status, next)) throw conflict(`A ${incident.status} report cannot be ${next}.`);
        await incidentsRepository.setStatus(incident.id, next, command.reason);
        await audit(`incident.${next}`, { status: incident.status }, { status: next, reason: command.reason });
        break;
      }
    }

    const updated = await incidentsRepository.findById(incident.id);
    if (updated === null) throw new DomainError('incident.not_found', 'That report does not exist.', 404);
    return updated;
  },
};

/**
 * Tells travellers planning to go there that it is closed. Failing to notify
 * must not fail the suspension, which is the decision that protects them.
 */
async function notifyTravellers(
  incident: { entityType: string; entityId: string; entityName: string | null },
  reason: string,
): Promise<void> {
  try {
    const affected = await incidentsRepository.travellersPlanning(incident.entityType, incident.entityId);
    for (const traveller of affected) {
      await notificationsService.notify(traveller.userId, {
        tripId: traveller.tripId,
        category: 'safety',
        trigger: `suspended:${incident.entityId}`,
        title: `${incident.entityName ?? 'A stop on your trip'} is closed to visitors`,
        body: `${reason} It is on your plan for ${traveller.tripTitle}. Choose another stop for that time.`,
        url: `/trips/${traveller.tripId}`,
        windowMinutes: 24 * 60,
      });
    }
  } catch (error) {
    logger.error('incidents.notify_failed', { reason: error instanceof Error ? error.message : 'unknown' });
  }
}
