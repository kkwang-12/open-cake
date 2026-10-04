const config=require('../../config');
const {isDraftPhone}=require('../shared/contact-draft');
const {createLocalOperationId}=require('../../utils/local-operation');
const STORAGE_KEY='jiajiale.local-addresses.v1';
const FIELDS=['receiverName','phone','province','city','district','detail'];
const clone=value=>JSON.parse(JSON.stringify(value));
function fail(code){throw Object.assign(new Error(code),{code});}
function counter(value){return Number.isSafeInteger(value)&&value>=0;}
function wellFormed(value){
  for(let i=0;i<value.length;i++){
    const code=value.charCodeAt(i);
    if(code<32||code===127)return false;
    if(code>=0xd800&&code<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))return false;}
    else if(code>=0xdc00&&code<=0xdfff)return false;
  }
  return true;
}
function normalizeDraft(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!FIELDS.includes(key)))fail('INVALID_ADDRESS');
  const value={};
  for(const field of FIELDS){
    if(typeof input[field]!=='string')fail('INVALID_ADDRESS');
    value[field]=input[field].normalize('NFC').trim();
    if(!value[field]||value[field].length>2048||!wellFormed(value[field]))fail('INVALID_ADDRESS');
  }
  // Draft input format only, not verification of ownership or a cloud phone policy.
  if(!isDraftPhone(value.phone))fail('INVALID_PHONE');
  return value;
}
function createLocalAddressClient(settings,platform,newId=createLocalOperationId){
  const key=STORAGE_KEY+':'+settings.appId,api=()=>platform||wx;
  function gate(){if(settings.stage!=='development'||settings.mode!=='shell')fail('LOCAL_ADDRESS_UNAVAILABLE');}
  function read(){
    gate();let saved;try{saved=api().getStorageSync(key);}catch(_){fail('LOCAL_ADDRESS_READ_FAILED');}
    if(saved===''||saved===undefined||saved===null)return {version:1,scope:'LOCAL_DEVICE',revision:0,defaultAddressId:null,selection:null,addresses:[]};
    if(!saved||saved.version!==1||saved.scope!=='LOCAL_DEVICE'||!counter(saved.revision)||!Array.isArray(saved.addresses)||
      !(saved.defaultAddressId===null||typeof saved.defaultAddressId==='string'))fail('LOCAL_ADDRESS_INVALID');
    const ids=new Set();
    for(const address of saved.addresses){
      if(!address||typeof address.addressId!=='string'||!address.addressId||ids.has(address.addressId)||!counter(address.version)||
        address.location!==null||address.requiresCloudValidation!==true)fail('LOCAL_ADDRESS_INVALID');
      const fields=Object.fromEntries(FIELDS.map(field=>[field,address[field]]));
      if(JSON.stringify(normalizeDraft(fields))!==JSON.stringify(fields)||!address.regionCodes||
        ['province','city','district'].some(field=>address.regionCodes[field]!==null))fail('LOCAL_ADDRESS_INVALID');
      ids.add(address.addressId);
    }
    if(saved.defaultAddressId!==null&&!ids.has(saved.defaultAddressId))fail('LOCAL_ADDRESS_INVALID');
    if(saved.selection!==null&&(!saved.selection||typeof saved.selection.addressId!=='string'||!counter(saved.selection.version)))fail('LOCAL_ADDRESS_INVALID');
    return clone(saved);
  }
  function save(book){
    book.revision++;if(!counter(book.revision))fail('LOCAL_ADDRESS_INVALID');
    try{api().setStorageSync(key,clone(book));if(JSON.stringify(api().getStorageSync(key))!==JSON.stringify(book))throw new Error();}
    catch(_){fail('LOCAL_ADDRESS_WRITE_FAILED');}
  }
  function check(book,revision){if(!counter(revision)||revision!==book.revision)fail('LOCAL_ADDRESS_CONFLICT');}
  function find(book,id,version){
    const address=book.addresses.find(item=>item.addressId===id);if(!address)fail('LOCAL_ADDRESS_NOT_FOUND');
    if(!counter(version)||address.version!==version)fail('LOCAL_ADDRESS_CONFLICT');return address;
  }
  function list(){const book=read();return {...book,addresses:book.addresses.map(address=>({...address,isDefault:address.addressId===book.defaultAddressId}))};}
  function create(input,revision){
    const value=normalizeDraft(input),book=read();check(book,revision);
    const id=newId();if(typeof id!=='string'||!id||book.addresses.some(address=>address.addressId===id))fail('LOCAL_ADDRESS_INVALID');
    book.addresses.push({addressId:id,version:0,...value,regionCodes:{province:null,city:null,district:null},
      location:null,requiresCloudValidation:true});save(book);return list();
  }
  function update(id,version,input,revision){
    const value=normalizeDraft(input),book=read();check(book,revision);const address=find(book,id,version);
    Object.assign(address,value,{version:address.version+1,location:null});if(!counter(address.version))fail('LOCAL_ADDRESS_INVALID');
    save(book);return list();
  }
  function remove(id,version,revision){
    const book=read();check(book,revision);find(book,id,version);
    book.addresses=book.addresses.filter(address=>address.addressId!==id);
    if(book.defaultAddressId===id)book.defaultAddressId=null;
    // Retain a stale explicit selection so deletion cannot silently choose another address.
    save(book);return list();
  }
  function setDefault(id,version,revision){
    const book=read();check(book,revision);find(book,id,version);
    if(book.defaultAddressId!==id){book.defaultAddressId=id;save(book);}return list();
  }
  function choose(id,version,revision){
    const book=read();check(book,revision);find(book,id,version);
    book.selection={addressId:id,version};save(book);return selection();
  }
  function selection(){
    const book=read(),reference=book.selection;
    const address=book.addresses.find(item=>item.addressId===(reference?reference.addressId:book.defaultAddressId));
    if(reference&&(!address||address.version!==reference.version))return {address:null,status:'CHANGED',notice:'所选地址已修改或删除，请重新选择。'};
    return {address:address?clone(address):null,status:address?'LOCAL_READY':'EMPTY',notice:''};
  }
  return {list,create,update,remove,setDefault,choose,selection};
}
module.exports={...createLocalAddressClient(config),createLocalAddressClient,normalizeDraft,FIELDS,STORAGE_KEY};
