import test from 'node:test';
import assert from 'node:assert/strict';
import { assessNextExposure } from '../src/domain/safety-decision.ts';

test('symptom gate blocks progression', () => assert.equal(
  assessNextExposure({maxRpe:7,maxSymptomSeverity:4,anyTechniqueCaution:false,formBreakdown:false}).action,
  'BLOCK_PROGRESSION'
));

test('technique concern holds load', () => assert.equal(
  assessNextExposure({maxRpe:7,maxSymptomSeverity:0,anyTechniqueCaution:true,formBreakdown:true}).action,
  'HOLD_LOAD'
));

test('AI is not required to determine eligibility', () => assert.equal(
  assessNextExposure({maxRpe:7,maxSymptomSeverity:0,anyTechniqueCaution:false,formBreakdown:false}).action,
  'ELIGIBLE_TO_PROGRESS'
));

test('safety block has precedence over technique and high RPE holds', () => {
  const result = assessNextExposure({maxRpe:10,maxSymptomSeverity:5,anyTechniqueCaution:true,formBreakdown:true});
  assert.equal(result.action, 'BLOCK_PROGRESSION');
  assert.equal(result.matchedRules[0]?.ruleId, 'SYMPTOM_BLOCK');
  assert.deepEqual(result.matchedRules.map(r => r.ruleId), ['SYMPTOM_BLOCK','TECHNIQUE_HOLD','HIGH_RPE_HOLD']);
});

test('policy is explicitly provisional rather than silently treated as approved clinical guidance', () => {
  const result = assessNextExposure({maxRpe:7,maxSymptomSeverity:0,anyTechniqueCaution:false,formBreakdown:false});
  assert.equal(result.ruleStatus, 'PROVISIONAL');
  assert.equal(result.ruleVersion, 'm1-safety-0.2.0');
});
