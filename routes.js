// import express from 'express';
// const router = new express.Router();
import axios from 'axios';

export default getUserEmailByID = (userID) => {
  return axios.get(`https://slack.com/api/users.info?token=${process.env.SLACK_TOKEN}&user=${userID}`)
  .then(({data}) => data.user.profile.email)
  .catch((err) => err);
}
