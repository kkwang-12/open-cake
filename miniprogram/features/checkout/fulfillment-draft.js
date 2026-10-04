const config=require('../../config');
const store=require('../../services/store-information');
const {validText,normalizeContact}=require('../shared/contact-draft');
const STORAGE_KEY='jiajiale.local-fulfillment-draft.v1';
const clone=value=>JSON.parse(JSON.stringify(value));
const counter=value=>Number.isSafeInteger(value)&&value>=0;
function fail(code){throw Object.assign(new Error(),{code});}
function createFulfillmentDraftClient(settings,platform,readStore=store.confirmed){
  const key=STORAGE_KEY+':'+settings.appId,api=()=>platform||wx;
  function gate(){if(settings.stage!=='development'||settings.mode!=='shell')fail('LOCAL_FULFILLMENT_UNAVAILABLE');}
  function read(){
    gate();let saved;try{saved=api().getStorageSync(key);}catch(_){fail('LOCAL_FULFILLMENT_READ_FAILED');}
    const reference=store.validate(readStore());
    if(saved===''||saved===undefined||saved===null)return {book:{version:1,scope:'LOCAL_DEVICE',revision:0,
      storeReferenceId:reference.referenceId,storeReferenceVersion:reference.referenceVersion,
      fulfillment:'PICKUP',pickupContact:{name:'',phone:''}},reference};
    if(!saved||saved.version!==1||saved.scope!=='LOCAL_DEVICE'||!counter(saved.revision)||
      typeof saved.storeReferenceId!=='string'||typeof saved.storeReferenceVersion!=='string'||
      !['PICKUP','DELIVERY'].includes(saved.fulfillment)||!saved.pickupContact||
      !validText(saved.pickupContact.name)||!validText(saved.pickupContact.phone))fail('LOCAL_FULFILLMENT_INVALID');
    return {book:clone(saved),reference};
  }
  function view(book,reference){
    let contactValid=false;try{normalizeContact(book.pickupContact);contactValid=true;}catch(_){}
    const configurationChanged=book.storeReferenceId!==reference.referenceId||book.storeReferenceVersion!==reference.referenceVersion;
    return {...clone(book),configurationChanged,contactValid,
      fulfillmentAllowed:reference.status!=='CLOSED'&&reference.fulfillmentModes.includes(book.fulfillment),
      checkoutAllowed:false,requiresCloudValidation:true};
  }
  function get(){const {book,reference}=read();return view(book,reference);}
  function check(book,reference,revision,referenceVersion){
    if(!counter(revision)||revision!==book.revision)fail('LOCAL_FULFILLMENT_CONFLICT');
    if(referenceVersion!==reference.referenceVersion)fail('LOCAL_STORE_REFERENCE_CHANGED');
  }
  function save(book){
    book.revision++;if(!counter(book.revision))fail('LOCAL_FULFILLMENT_INVALID');
    try{api().setStorageSync(key,clone(book));if(JSON.stringify(api().getStorageSync(key))!==JSON.stringify(book))throw new Error();}
    catch(_){fail('LOCAL_FULFILLMENT_WRITE_FAILED');}
  }
  function setMode(mode,revision,referenceVersion){
    const {book,reference}=read();check(book,reference,revision,referenceVersion);
    if(reference.status==='CLOSED'||!reference.fulfillmentModes.includes(mode))fail('FULFILLMENT_UNAVAILABLE');
    if(book.fulfillment!==mode||book.storeReferenceId!==reference.referenceId||book.storeReferenceVersion!==reference.referenceVersion){
      Object.assign(book,{fulfillment:mode,storeReferenceId:reference.referenceId,storeReferenceVersion:reference.referenceVersion});save(book);
    }
    return view(book,reference);
  }
  function saveContact(contact,revision,referenceVersion){
    const normalized=normalizeContact(contact),{book,reference}=read();check(book,reference,revision,referenceVersion);
    if(book.fulfillment!=='PICKUP'||reference.status==='CLOSED'||!reference.fulfillmentModes.includes('PICKUP'))fail('FULFILLMENT_UNAVAILABLE');
    if(book.storeReferenceId!==reference.referenceId||book.storeReferenceVersion!==reference.referenceVersion)fail('LOCAL_STORE_REFERENCE_CHANGED');
    if(JSON.stringify(book.pickupContact)!==JSON.stringify(normalized)){book.pickupContact=normalized;save(book);}
    return view(book,reference);
  }
  return {get,setMode,saveContact};
}
module.exports={...createFulfillmentDraftClient(config),createFulfillmentDraftClient,STORAGE_KEY};
