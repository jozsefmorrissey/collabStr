const shell = require('shelljs');
const request = require('request');

shell.config.silent = true;

exports.config = () => {
  const configJsonStr = shell.exec(`confidentalInfo.sh toJson ColabStr`).stdout.trim();
  const confObj = JSON.parse(configJsonStr)

  confObj.pageUrl = `${confObj['REST_SRVC_DOMAIN']}:${confObj['REST_SRVC_PORT']}/${confObj['ENDPOINT_PAGE']}`;
  console.log(confObj.pageUrl)

  function buildUpdate(topic, msg, user) {
    const req = {
      url: confObj.pageUrl,
      json: true,
      body:{
        page: {
          identifier: topic,
          jsonObj: msg,
        },
        user,
    }};
    request.post(req, (err, req, body) => {
      if (err) {
        console.log(err);
      } else {
        console.log(body);
      }
    });
  }

  function getFunc(topic, user, success, failure) {
    request.get(`${confObj.pageUrl}${topic}`, (error, res, body) => {
      if (error) {
        failure(error);
      } else {
        body ? success(body) : success('{}');
      }
    });
  }

  function authorized(user, topic, success, failure) {
    console.log(user);
    request.post(confObj.pageUrl, {
      form: {
        page: {
          identifier: topic,
        },
        user,
      }
    }, (error, res, body) => {
      console.log(error);
      if (error) {
        failure(error);
      } else {
        success(body);
      }
    });
  }

  function getUserId(user) {
    return user.email;
  }

  function validate(content) {
    try {
      JSON.parse(content);
      return true;
    } catch (e) {
      return false;
    }
  }

  confObj.collab = {
    authFunc: authorized,
    updateFunc: buildUpdate,
    getFunc: getFunc,
    getUserId: getUserId,
    messageValidate: validate,
  }

  function getConfig(id) {
    if (id) {
      return confObj[id];
    }
    return Object.keys(confObj);
  }

  return getConfig;
};
