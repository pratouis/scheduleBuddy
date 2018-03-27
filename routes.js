/*
* This file is for requests made to SLACK API
*/
import axios from 'axios';

const getUserEmailByID = (userID) => {
  return axios.get(`https://slack.com/api/users.info?token=${process.env.SLACK_TOKEN}&user=${userID}`)
  .then(({data}) => {
    console.log('user data: ', data.user);
    return data.user.profile.email;
  })
  .catch((err) => {
    console.log('error in email: ', err);
    return err;
  });
}


module.exports = {
  getUserEmailByID: getUserEmailByID
}
