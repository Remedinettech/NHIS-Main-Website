import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendGrievanceSections, CURRENT_GRIEVANCE_BENEFICIARIES, missingGrievanceSections, updateGrievanceBeneficiaries, type AdminPageValues } from '@nhis/shared-types';

test('current beneficiary action preserves custom sections and Tamil, and is idempotent', () => {
  const values: AdminPageValues = { en: { title: 'Grievances', sections: [
    { id: 'mdindia-tpa', heading: 'Old content', blocks: [] },
    { id: 'custom', heading: 'Keep this', blocks: [] },
    { id: 's3', heading: 'Old Vidal', blocks: [] },
  ] }, ta: { title: 'Tamil title', sections: [{ id: 'ta-custom', blocks: [] }] } };
  const updated = updateGrievanceBeneficiaries(values);
  assert.deepEqual(updated.ta, values.ta);
  assert.equal(updated.en?.sections[0].heading, 'HITPA Beneficiary');
  assert.equal(updated.en?.sections.filter(s => s.heading === 'VIDAL HEALTH TPA Beneficiary').length, 1);
  assert.equal(updated.en?.sections.at(-1)?.id, 'custom');
  assert.equal(values.en?.sections[0].heading, 'Old content');
  assert.deepEqual(updateGrievanceBeneficiaries(updated), updated);
  assert.deepEqual(updateGrievanceBeneficiaries({ en: null, ta: values.ta }), { en: null, ta: values.ta });
});

test('adding supplied tables preserves existing form content and missing translations', () => {
  const values: AdminPageValues = { en: { title: 'Our title', sections: [{ id: 'custom', blocks: [] }] }, ta: null };
  assert.equal(missingGrievanceSections(values), 3);
  const updated = appendGrievanceSections(values);
  assert.equal(updated.en?.title, 'Our title');
  assert.equal(updated.en?.sections[0].id, 'custom');
  assert.equal(updated.en?.sections.length, 4);
  assert.equal(updated.ta, null);
  assert.equal(values.en?.sections.length, 1);
  assert.equal(missingGrievanceSections(updated), 0);
  assert.deepEqual(appendGrievanceSections(updated), updated);
});

test('the beneficiary sections are the live site\'s wording, kept as published', () => {
  const text = (section: { blocks: Array<{ type: string; content?: Array<{ type: string; text?: string; address?: string }> }> }) =>
    section.blocks[0].content?.map((node) => node.text ?? `<${node.address}>`).join('') ?? '';
  const [hitpa, mediAssist, vidal] = CURRENT_GRIEVANCE_BENEFICIARIES;
  assert.deepEqual(CURRENT_GRIEVANCE_BENEFICIARIES.map((s) => s.heading), ['HITPA Beneficiary', 'Medi Assist TPA Beneficiary', 'VIDAL HEALTH TPA Beneficiary']);
  assert.equal(text(hitpa), 'For all your grievances and Short settlement cases. Please mail to tnnhisgrievance<tnnhisgrievance@hitpa.co.in> and <010600@uiic.co.in>');
  assert.equal(text(mediAssist), 'For all your grievances and Short settlement cases. please mail to <tnnhisgrievance@mediassist.in> and <010600@uiic.co.in>');
  assert.equal(text(vidal), 'For all your grievances and Short settlement cases. Please mail to <tnnhisgrievance@vidalhealth.com>and <010600@uiic.co.in>');
});
