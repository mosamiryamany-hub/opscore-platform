'use strict';
const crypto=require('node:crypto');
function signPdfBuffer(buffer, signerId){
  const privateKey=process.env.OPSC_PDF_SIGNING_PRIVATE_KEY_PEM;
  if(!privateKey) throw new Error('PDF_SIGNING_NOT_CONFIGURED');
  const signer=String(signerId||process.env.OPSC_PDF_SIGNER_ID||'').trim();
  if(!signer) throw new Error('PDF_SIGNER_ID_REQUIRED');
  const documentSha256=crypto.createHash('sha256').update(buffer).digest('hex');
  const signature=crypto.sign('sha256',buffer,privateKey).toString('base64url');
  return {schemaVersion:'opscore.pdf-signature.v1',algorithm:'SHA256withConfiguredPrivateKey',signerId:signer,documentSha256,signatureBase64Url:signature};
}
function verifyPdfSignature(buffer,record){
  const publicKey=process.env.OPSC_PDF_SIGNING_PUBLIC_KEY_PEM;
  if(!publicKey) throw new Error('PDF_VERIFY_KEY_NOT_CONFIGURED');
  if(!record?.documentSha256 || !record?.signatureBase64Url) return false;
  const actual=crypto.createHash('sha256').update(buffer).digest('hex');
  if(actual!==record.documentSha256) return false;
  return crypto.verify('sha256',buffer,publicKey,Buffer.from(record.signatureBase64Url,'base64url'));
}
module.exports={signPdfBuffer,verifyPdfSignature};
