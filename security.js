/* security.js -
*   holds encryption and decryption functions and variables
*     used to securely store google authentication
*/

import crypto from 'crypto';

/* using block cipher primitive
* iv - initialization vector buffer
*
* buffer must be 16 for hex, and key must fit
*/
const buffers = {
    iv: Buffer.from(process.env.ENCRYPTION_IV, "hex"),
    key: new Buffer(process.env.ENCRYPTION_KEY),
}

/*  encryptGoogleCalAuth
*   takes authentication tokens and encrypts stringified version
*   @params token object
*   returns string
*     - on successful encryption returns string
*     - on err returns empty string
*/
export const encryptGoogleCalAuth = (tokens) => {
  try {
    let cipher = crypto.createCipheriv("aes128", buffers.key, buffers.iv);
    let result = cipher.update(JSON.stringify(tokens), "utf8", "hex");
    result += cipher.final("hex");
    return result;
  }catch (err) {
    console.error('error in encryption: ', err);
    return "";
  }
}

/*  decryptGoogleCalAuth
*   takes encrypted string and decrypts string to token object
*   @params hash string
*   returns object
*       - on successful decryption returns token object
*       - on error returns empty object
*/
export const decryptGoogleCalAuth = (text) => {
  try {
    let decipher = crypto.createDecipheriv("aes128", buffers.key, buffers.iv);
    let result = decipher.update(text, "hex");
    result += decipher.final();
    return JSON.parse(result);
  } catch (err) {
    console.error('error in decryption: ', err);
    return {};
  }
}
