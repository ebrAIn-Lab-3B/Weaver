import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { markdownClient } from '../../../apps/vscode-extension/src/markdownWebview';

function splitAck(sent: Record<string, unknown>[]) {
  const request = [...sent].reverse().find(event => event.type === 'split' || event.type === 'split-slot')!;
  return { transactionId: request.transactionId, documentId: request.documentId, projectionId: request.projectionId };
}

function fixture() {
  const dom = new JSDOM('<button id="source"></button><main><p contenteditable="plaintext-only" data-inline-original="abcd" data-source-line="0" data-source-type="paragraph_open">abcd</p></main>', { runScripts: 'outside-only' });
  const sent: Record<string, unknown>[] = [];
  Object.assign(dom.window, { acquireVsCodeApi: () => ({ postMessage: (event: Record<string, unknown>) => sent.push(event) }), editorConfig: { documentId: 'doc', projectionId: 'projection', version: 1, labels: {conflict:'Conflict', copyDraft:'Copy', openDraft:'Open'} } });
  dom.window.eval(markdownClient);
  const node = dom.window.document.querySelector('p')!; node.focus();
  const range = dom.window.document.createRange(); range.setStart(node.firstChild!, 1); range.setEnd(node.firstChild!, 3);
  const selection = dom.window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  return {dom, node, sent};
}
function paste(dom: JSDOM, node: Element, value: string) {
  const event = new dom.window.Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: {getData: () => value} });
  node.dispatchEvent(event);
}

describe('multiline paste as queued, editable splits', () => {
  it('pastes nonempty plain lines into a new paragraph insertion field', () => {
    const dom = new JSDOM('<button id="source"></button><main><div class="insert-slot" data-insert-line="0"><div class="insert-field" contenteditable="plaintext-only"></div></div></main>', { runScripts: 'outside-only' });
    const sent: Record<string, unknown>[] = [];
    Object.assign(dom.window, { acquireVsCodeApi: () => ({ postMessage: (event: Record<string, unknown>) => sent.push(event) }), editorConfig: { documentId: 'doc', projectionId: 'projection', version: 1, labels: {conflict:'Conflict', copyDraft:'Copy', openDraft:'Open'} } });
    dom.window.eval(markdownClient);
    const node = dom.window.document.querySelector('.insert-field') as HTMLElement; node.focus();
    const range = dom.window.document.createRange(); range.selectNodeContents(node); range.collapse(true);
    const selection = dom.window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    paste(dom, node, 'ONE\nTWO\nTHREE');
    expect(node.textContent).toBe('ONE');
    expect([...dom.window.document.querySelectorAll('main p')].map(item => item.textContent)).toEqual(['TWO', 'THREE']);
    const tail = dom.window.document.querySelectorAll('main p')[1];
    tail.textContent = 'THREE typed';
    tail.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    expect(sent.at(-1)).toMatchObject({type:'slot-change', value:'ONE'});
    dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data:{type:'edit-applied',version:2,expected:'ONE',slotStartLine:0}}));
    expect(sent.at(-1)).toMatchObject({type:'split-slot',caret:3});
    dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data:{...splitAck(sent),type:'split-applied',version:3,slot:true,shift:3,line:0,leftLine:0,nextLine:2,leftExpected:'ONE',rightExpected:''}}));
    expect(sent.at(-1)).toMatchObject({type:'inline-change',value:'TWO'});
    dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data:{type:'edit-applied',version:4,expected:'TWO'}}));
    expect(sent.at(-1)).toMatchObject({type:'split',caret:3});
    dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data:{...splitAck(sent),type:'split-applied',version:5,line:2,nextLine:4,leftExpected:'TWO',rightExpected:''}}));
    expect(sent.at(-1)).toMatchObject({type:'inline-change',value:'THREE typed'});
    expect(dom.window.document.querySelectorAll('[role=alert]')).toHaveLength(0);
    dom.window.close();
  });
  it('inserts each plain line and preserves input immediately after paste', () => {
    const {dom,node,sent}=fixture(); paste(dom,node,'ONE\nTWO\nTHREE');
    const blocks=[...dom.window.document.querySelectorAll('main p')];
    expect(blocks.map(item=>item.textContent)).toEqual(['aONE','TWO','THREEd']);
    expect(sent.at(-1)).toMatchObject({type:'inline-change',value:'aONEd'});
    const tail=blocks[2]; expect(dom.window.getSelection()!.anchorNode).toBe(tail.firstChild); expect(dom.window.getSelection()!.anchorOffset).toBe(5); tail.textContent='typed '+tail.textContent; tail.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data:{type:'edit-applied',version:2,expected:'aONEd'}}));
    expect(sent.at(-1)).toMatchObject({type:'split',caret:4});
    dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data:{...splitAck(sent), type:'split-applied',version:3,line:0,nextLine:2,leftExpected:'aONE',rightExpected:'d'}}));
    expect(sent.at(-1)).toMatchObject({type:'inline-change',value:'TWOd'});
    dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data:{type:'edit-applied',version:4,expected:'TWOd'}}));
    expect(sent.at(-1)).toMatchObject({type:'split',caret:3});
    dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data:{...splitAck(sent), type:'split-applied',version:5,line:2,nextLine:4,leftExpected:'TWO',rightExpected:'d'}}));
    expect(sent.at(-1)).toMatchObject({type:'inline-change',value:'typed THREEd'});
    dom.window.close();
  });
  it('preserves all provisional lines on an edit conflict',()=>{
    const {dom,node}=fixture(); paste(dom,node,'ONE\nTWO\nTHREE');
    dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data:{type:'conflict',detail:'Changed'}}));
    const alerts=[...dom.window.document.querySelectorAll('[role=alert]')];
    expect(alerts).toHaveLength(3);
    expect([...dom.window.document.querySelectorAll('main p:not([role=alert])')].map(item=>item.textContent)).toEqual(['aONE','TWO','THREEd']);
    dom.window.close();
  });
  it('rejects ambiguous markup without changing the block',()=>{
    const {dom,node,sent}=fixture(); paste(dom,node,'text\n# title');
    expect(node.textContent).toBe('abcd'); expect(sent.at(-1)).toMatchObject({type:'multiline-paste'}); dom.window.close();
  });
});
