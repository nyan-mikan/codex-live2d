import test from 'node:test';
import assert from 'node:assert/strict';
import './model-profile.js';
const {readProfile}=Live2DProfile;
test('Default profile has no character expressions or fixed motion indexes',()=>{
  const profile=readProfile();assert.deepEqual(profile.expressions,{});assert.deepEqual(profile.neutral,{});assert.equal(profile.mouthParameter,'PARAM_MOUTH_OPEN_Y');
});
test('User profiles independently specify neutral, speech and expression parameters',()=>{
  const profile=readProfile({mouthParameter:'CustomMouth',neutral:{FaceAmount:.1},speechNeutral:{FaceAmount:0},expressions:{custom:{label:'My expression',parameters:{FaceAmount:.8}}},clickMotionGroup:'clicks'});
  assert.equal(profile.expressions.custom.parameters.FaceAmount,.8);assert.equal(profile.speechNeutral.FaceAmount,0);assert.equal(profile.clickMotionGroup,'clicks');assert.equal(profile.mouthParameter,'CustomMouth');
});
test('Invalid parameter values and expression names are rejected',()=>{
  for(const profile of [{neutral:{x:NaN}},{neutral:{x:'1'}},{mouthParameter:'bad/path'},{expressions:{'bad/name':{parameters:{}}}}])assert.throws(()=>readProfile(profile));
});
