import { describe, expect, it } from 'vitest';
import { DeterministicGateway } from '@/platform/ai/deterministic';

const gateway = new DeterministicGateway();

describe('DeterministicGateway.extractBrief', () => {
  it('extracts the PRD validation prompt end to end', async () => {
    const { brief, extractedFields } = await gateway.extractBrief(
      'Plan a 4 day family trip from Coimbatore in December within ₹25,000, we like nature and heritage and want to avoid crowds',
      null,
    );
    expect(brief.durationDays).toBe(4);
    expect(brief.origin?.label).toBe('Coimbatore');
    expect(brief.budget?.totalMinor).toBe(2_500_000);
    expect(brief.party?.type).toBe('family');
    expect(brief.interests).toEqual(expect.arrayContaining(['nature', 'heritage']));
    expect(brief.crowdTolerance).toBe('low');
    expect(brief.dateFlexibility).toBe('2026-12');
    expect(extractedFields).toEqual(
      expect.arrayContaining(['durationDays', 'origin', 'budget', 'interests', 'crowdTolerance']),
    );
  });

  it('parses rupee amounts written in several ways', async () => {
    const cases: Array<[string, number]> = [
      ['under ₹25,000', 2_500_000],
      ['budget 25000 rupees', 2_500_000],
      ['around Rs. 12,500', 1_250_000],
      ['15k budget', 1_500_000],
      ['1.5 lakh', 15_000_000],
      ['within INR 8,000', 800_000],
    ];
    for (const [text, expected] of cases) {
      const { brief } = await gateway.extractBrief(`Trip ${text}`, null);
      expect(brief.budget?.totalMinor, text).toBe(expected);
    }
  });

  it('parses duration from days, nights and weekend', async () => {
    expect((await gateway.extractBrief('3 day trip', null)).brief.durationDays).toBe(3);
    expect((await gateway.extractBrief('2 nights in Ooty', null)).brief.durationDays).toBe(3);
    expect((await gateway.extractBrief('weekend getaway', null)).brief.durationDays).toBe(2);
    expect((await gateway.extractBrief('a week in the hills', null)).brief.durationDays).toBe(7);
  });

  it('recognises the party type and counts', async () => {
    expect((await gateway.extractBrief('solo trip', null)).brief.party?.type).toBe('solo');
    expect((await gateway.extractBrief('trip with my partner', null)).brief.party?.type).toBe('couple');
    expect((await gateway.extractBrief('going with friends', null)).brief.party?.type).toBe('friends');

    const { brief } = await gateway.extractBrief('family trip, 2 adults and 3 children', null);
    expect(brief.party?.adults).toBe(2);
    expect(brief.party?.children).toBe(3);
  });

  it('recognises pace and accessibility constraints', async () => {
    const relaxed = await gateway.extractBrief('a relaxed trip with less walking', null);
    expect(relaxed.brief.pace).toBe('relaxed');
    expect(relaxed.brief.constraints?.lowWalking).toBe(true);

    const packed = await gateway.extractBrief('pack in as much as possible', null);
    expect(packed.brief.pace).toBe('packed');
  });

  it('asks one focused clarification for the most important missing field', async () => {
    const { clarification } = await gateway.extractBrief('I want to go somewhere nice', null);
    expect(clarification).not.toBeNull();
    expect(clarification!.question).toMatch(/\?$/);
    expect(clarification!.field).toBe('durationDays');
  });

  it('asks only one question at a time', async () => {
    const { clarification } = await gateway.extractBrief('somewhere nice', null);
    const questionMarks = (clarification!.question.match(/\?/g) ?? []).length;
    expect(questionMarks).toBe(1);
  });

  it('asks nothing further once the brief is complete', async () => {
    const { clarification } = await gateway.extractBrief(
      '4 day family trip from Coimbatore in December under ₹25,000, nature and heritage, relaxed pace, avoid crowds',
      null,
    );
    expect(clarification).toBeNull();
  });

  it('merges a follow-up answer into the prior brief without losing fields', async () => {
    const first = await gateway.extractBrief('4 day trip from Coimbatore, nature', null);
    const second = await gateway.extractBrief('budget is ₹25,000', first.brief);
    expect(second.brief.durationDays).toBe(4);
    expect(second.brief.origin?.label).toBe('Coimbatore');
    expect(second.brief.budget?.totalMinor).toBe(2_500_000);
    expect(second.brief.interests).toContain('nature');
  });

  it('lets a follow-up correct an earlier value', async () => {
    const first = await gateway.extractBrief('4 day trip from Coimbatore', null);
    const second = await gateway.extractBrief('make it 3 days instead', first.brief);
    expect(second.brief.durationDays).toBe(3);
  });

  it('maps everyday words onto catalog themes', async () => {
    const { brief } = await gateway.extractBrief('we like trekking, temples and good food', null);
    expect(brief.interests).toEqual(expect.arrayContaining(['trekking', 'temples', 'local_food']));
  });

  it('reports its mode so the UI can label the degraded path', async () => {
    const { mode } = await gateway.extractBrief('weekend trip', null);
    expect(mode).toBe('deterministic');
  });

  it('produces a schema-valid brief for arbitrary input', async () => {
    const { TripBriefSchema } = await import('@/platform/ai/schemas');
    for (const text of ['', 'hello', '!!!', 'a'.repeat(500), '4 day trip ₹25,000']) {
      const { brief } = await gateway.extractBrief(text, null);
      expect(TripBriefSchema.safeParse(brief).success, text.slice(0, 20)).toBe(true);
    }
  });

  it('does not invent an origin that was never mentioned', async () => {
    const { brief } = await gateway.extractBrief('4 day trip under 20000', null);
    expect(brief.origin).toBeUndefined();
  });
});

describe('DeterministicGateway.describeItinerary', () => {
  it('describes a day without claiming anything it was not given', async () => {
    const prose = await gateway.describeItinerary({
      destinationName: 'Ooty and the Nilgiris',
      days: [
        {
          dayNumber: 1,
          itemTitles: ['Government Botanical Garden', 'Ooty Lake'],
        },
      ],
    });
    expect(prose.summary).toContain('Ooty');
    expect(prose.dayDescriptions).toHaveLength(1);
    expect(prose.dayDescriptions[0]).toContain('Botanical Garden');
    expect(prose.summary).not.toMatch(/\bbest\b|\bguarantee/i);
  });
});
