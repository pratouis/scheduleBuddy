/*
* This file is for requests made to SLACK API
*/
import axios from 'axios';

const getUserInfoByID = (userID) => {
  return axios.get(`https://slack.com/api/users.info?token=${process.env.SLACK_TOKEN}&user=${userID}`)
  .then(({data}) => {
    // console.log('user data: ', data.user);
    return {email: data.user.profile.email, name: data.user.profile.real_name_normalized};
  })
  .catch((err) => {
    // console.log('error in email: ', err);
    return err;
  });
}


module.exports = {
  getUserInfoByID: getUserInfoByID
}
