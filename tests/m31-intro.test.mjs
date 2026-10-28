import test from 'node:test';
import assert from 'node:assert/strict';
import {createTimeline} from '../src/scenes/intro/timeline.js';

test('M3.1 减少动态开场在每个采样点保持同一静态机位',()=>{
  const timeline=createTimeline({reduced:true});
  timeline.finish();const expected=timeline.sample().camera.toArray();
  for(const fraction of [0,.15,.4,.7,.95]){
    timeline.play();timeline.advance(timeline.duration*fraction);
    assert.deepEqual(timeline.sample().camera.toArray(),expected);
    assert.deepEqual(timeline.sample().assembly,[1,1,1]);
  }
});
