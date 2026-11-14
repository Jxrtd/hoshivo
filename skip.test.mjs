import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSkipData} from './skip.mjs';
import {readSkipSettings,activeSkip,timelineSegments} from './public/skip.js';
test('timeline markers use episode timestamps and clamp to video duration',()=>{
  const ranges=timelineSegments({intro:{start:0,end:90},outro:{start:900,end:1100}},1000);
  assert.deepEqual(ranges,[{kind:'intro',start:0,end:90,left:0,width:9},{kind:'outro',start:900,end:1000,left:90,width:10}]);
  assert.deepEqual(timelineSegments(null,1000),[]);assert.deepEqual(timelineSegments({intro:{start:0,end:90}},NaN),[]);assert.deepEqual(timelineSegments({outro:{start:1100,end:1200}},1000),[]);
});
test('skip settings default on and preserve explicit off preferences',()=>{
  assert.deepEqual(readSkipSettings({getItem:()=>null}),{intro:true,outro:true});
  assert.deepEqual(readSkipSettings({getItem:()=>'{"intro":false,"outro":false}'}),{intro:false,outro:false});
  assert.deepEqual(readSkipSettings({getItem:()=>'{bad json'}),{intro:true,outro:true});
});
test('missing, invalid, and overlapping timestamps cannot skip story content',()=>{
  assert.deepEqual(normalizeSkipData(null),{intro:null,outro:null});
  assert.deepEqual(normalizeSkipData({intro:{start:-1,end:90},outro:{start:100,end:100}}),{intro:null,outro:null});
  assert.deepEqual(normalizeSkipData({intro:{start:0,end:89},outro:{start:88,end:150}}),{intro:{start:0,end:89},outro:null});
});
test('skip detection respects boundaries, duration, and post-credit content',()=>{
  const ranges={intro:{start:0,end:89},outro:{start:1460,end:1549}};
  assert.deepEqual(activeSkip(ranges,0,1559),{kind:'intro',end:89});
  assert.equal(activeSkip(ranges,89,1559),null);assert.equal(activeSkip(ranges,1200,1559),null);
  assert.deepEqual(activeSkip(ranges,1461,1559),{kind:'outro',end:1549});
  assert.equal(activeSkip(ranges,1550,1559),null);
  assert.deepEqual(activeSkip(ranges,1461,1500),{kind:'outro',end:1500});
  assert.equal(activeSkip(ranges,5,NaN),null);assert.equal(activeSkip(null,5,1500),null);
});
