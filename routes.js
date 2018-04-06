/*
* This file is for requests made to SLACK API
*/
import axios from 'axios';

/** getUserInfoByID - queries slack web API with the method 'users.info' using
*                     slack authentication to get user's email and name
*   @param userID: slackID associated with slack user
*   return outcome of promise
*     on success an object specifying email and name
*     on error just the error
*/
const getUserInfoByID = (userID) => {
  return axios.get(`https://slack.com/api/users.info?token=${process.env.SLACK_TOKEN}&user=${userID}`)
  .then(({data}) => {
    return {email: data.user.profile.email, name: data.user.profile.real_name_normalized};
  })
  .catch((err) => {
    return err;
  });
}


module.exports = {
  getUserInfoByID: getUserInfoByID
}
