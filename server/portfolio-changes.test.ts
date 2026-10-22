import test from 'node:test';
import assert from 'node:assert/strict';
import { comparable, portfolioChanges, mergePortfolioChanges, rebasePortfolioDraft } from '../src/portfolio-changes';
test('only modified fields are sent and unrelated remote edits survive', () => {
  const before = { profile:{name:'A',pageCopy:{posts:'old'}}, works:[{id:'1',title:'one'}] };
  const draft = structuredClone(before); draft.profile.name='B';
  const changes=portfolioChanges(before,draft);
  assert.deepEqual(changes.map(c=>c.path),[['profile','name']]);
  const current=structuredClone(before);current.works[0].title='remote';
  const result=mergePortfolioChanges(current,changes);
  assert.equal(result.next.profile.name,'B');assert.equal(result.next.works[0].title,'remote');assert.deepEqual([...result.sections],['profile']);
});
test('stale list edits conflict instead of deleting another editor additions',()=>{
  const before={works:[{id:'1'}]},draft={works:[]};
  assert.throws(()=>mergePortfolioChanges({works:[{id:'1'},{id:'2'}]},portfolioChanges(before,draft)),/其他页面/);
});
test('signed URL refresh and aliases do not mark data dirty',()=>{
  assert.equal(comparable({images:['https://bucket.test/a.png?q-sign-algorithm=sha1&q-signature=old'],page_copy:{x:1}}),comparable({images:['https://bucket.test/a.png?q-sign-algorithm=sha1&q-signature=new'],page_copy:{x:2}}));
});
test('prototype paths and unsupported sections rejected; empty save does not write',()=>{
  assert.throws(()=>mergePortfolioChanges({},[{path:['profile','__proto__','x'],before:null,value:1}]),/不受支持/);
  assert.throws(()=>mergePortfolioChanges({},[{path:['secrets'],before:null,value:1}]),/不受支持/);
  assert.equal(mergePortfolioChanges({profile:{}},[]).sections.size,0);
});
test('saving one field preserves newer typing and accepts unrelated remote changes',()=>{
  const submitted={profile:{name:'sent',intro:'old'},works:[]};
  const saved={profile:{name:'sent',intro:'remote'},works:[]};
  const draft={profile:{name:'typed while saving',intro:'old'},works:[]};
  assert.deepEqual(rebasePortfolioDraft(saved,submitted,draft),{profile:{name:'typed while saving',intro:'remote'},works:[]});
});
