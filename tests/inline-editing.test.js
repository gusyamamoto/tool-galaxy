const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'../inline-editing.js'),'utf8'),context);
const Rename=vm.runInContext('SelectedTitleRename',context);
test('selected-title taps use an 8px radial movement tolerance',()=>{
    const start={x:20,y:30};
    assert.equal(Rename.moved(start,{clientX:28,clientY:30}),false);
    assert.equal(Rename.moved(start,{clientX:29,clientY:30}),true);
    assert.equal(Rename.moved(start,{clientX:26,clientY:36}),true);
});
test('an unavailable selected body leaves no active title control',()=>{
    const attributes=new Set(['role','tabindex','aria-label']);
    const editor=Object.assign(Object.create(Rename.prototype),{enabled:()=>true,getEntry:()=>undefined,host:{dataset:{sheetTitle:'true'},removeAttribute:key=>attributes.delete(key)}});
    editor.sync();assert.equal(editor.host.dataset.sheetTitle,undefined);assert.equal(attributes.size,0);
});
function fixture(onSave){
    const buttons=[{disabled:false},{disabled:false}],attributes={};let error='',reported=0,cancelled=0;
    const input={value:'Original draft',disabled:false,validity:{},setCustomValidity(value){error=value;this.validity.customError=!!value;},removeAttribute(key){delete attributes[key];},setAttribute(key,value){attributes[key]=value;},focus(){},reportValidity(){reported++;}};
    const editor=Object.assign(Object.create(Rename.prototype),{edit:{id:'original-id'},input,form:{querySelectorAll:()=>buttons},onSave,cancel(){cancelled++;this.edit=null;}});
    return {editor,buttons,input,attributes,error:()=>error,reported:()=>reported,cancelled:()=>cancelled};
}
test('inline rename delegates identity/validation and retains its draft on save failure',async()=>{
    let received;
    const f=fixture(async(...args)=>{received=args;throw new Error('Existing validation message');});
    await f.editor.save();assert.deepEqual(received,['original-id','Original draft']);
    assert.equal(f.input.value,'Original draft');assert.equal(f.attributes['aria-invalid'],'true');
    assert.equal(f.error(),'Existing validation message');assert.equal(f.reported(),1);assert.equal(f.cancelled(),0);
    assert.equal(f.editor.edit.pending,false);assert.equal(f.input.disabled,false);assert(f.buttons.every(button=>!button.disabled));
});
test('a completed rename leaves editing; a stale failure cannot annotate another inspection',async()=>{
    const success=fixture(async()=>{});await success.editor.save();assert.equal(success.cancelled(),1);
    let reject;
    const stale=fixture(()=>new Promise((resolve,fail)=>{reject=fail;}));const saving=stale.editor.save();
    stale.editor.edit={id:'other-id',pending:true};stale.input.value='Other draft';
    reject(new Error('Old failure'));await saving;
    assert.equal(stale.error(),'');assert.equal(stale.input.value,'Other draft');assert.equal(stale.cancelled(),0);
    assert.equal(stale.editor.edit.pending,true);assert.equal(stale.input.disabled,true);
});
