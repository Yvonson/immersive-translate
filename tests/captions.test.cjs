const {test}=require('node:test');
const assert=require('node:assert/strict');
const formats=require('../src/lib/captionFormats.js');
test('WebVTT handles settings, multiline, markup, entities, overlaps and malformed cues',()=>{
  const cues=formats.parse('WEBVTT\n\nNOTE hidden\nignore\n\n1\n00:00:01.200 --> 00:00:03.400 align:start\n<b>Hello &amp; friends</b>\nsecond line\n\n2\n00:02.000 --> 00:04.000\nOverlap\n\n3\n00:08.000 --> 00:02.000\nInvalid\n');
  assert.equal(cues.length,2);assert.equal(cues[0].start,1.2);assert.equal(cues[0].text,'Hello & friends\nsecond line');
});
test('YouTube JSON3 and XML timedtext preserve timing and decode safe text',()=>{
  const json=formats.parse(JSON.stringify({events:[{tStartMs:1000,dDurationMs:2000,segs:[{utf8:'Hello '},{utf8:'world'}]},{tStartMs:0}]}));
  assert.deepEqual(json,[{id:'0',start:1,end:3,text:'Hello world'}]);
  const xml=formats.parse('<transcript><text start="1.2" dur="2">Hello &amp; &#x1f30d;</text></transcript>');assert.equal(xml[0].text,'Hello & 🌍');
  assert.equal(formats.parse('<timedtext><body><p t="1000" d="2000"><s>Hello</s></p></body></timedtext>')[0].end,3);
});
test('Empty, malformed and oversized subtitle bodies cannot become a timeline',()=>{
  for(const value of ['', '<html>login</html>', '{bad}', 'x'.repeat(2000001), null]) assert.deepEqual(formats.parse(value),[]);
  assert.equal(formats.plain('&#99999999; &lt;script&gt;'),' <script>'.trim());
});
