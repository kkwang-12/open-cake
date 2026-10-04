const isDraftPhone=value=>typeof value==='string'&&/^1[3-9]\d{9}$/.test(value);
function validText(value){
  if(typeof value!=='string'||value.length>2048)return false;
  for(let i=0;i<value.length;i++){
    const code=value.charCodeAt(i);if(code<32||code===127)return false;
    if(code>=0xd800&&code<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))return false;}
    else if(code>=0xdc00&&code<=0xdfff)return false;
  }
  return true;
}
function normalizeContact(input){
  const fail=code=>{throw Object.assign(new Error(),{code});};
  if(!input||Object.keys(input).length!==2||!validText(input.name)||!validText(input.phone))fail('INVALID_CONTACT');
  const name=input.name.normalize('NFC').trim(),phone=input.phone.trim();
  if(!name)fail('INVALID_CONTACT');if(!isDraftPhone(phone))fail('INVALID_PHONE');return {name,phone};
}
module.exports={isDraftPhone,validText,normalizeContact};
