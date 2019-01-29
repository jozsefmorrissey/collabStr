const express = require('express');
const enableWs = require('express-ws');
const request = require('request');

const diff_match_patch = require('./lib/diff-match-patch').diff_match_patch;

const app = express();
const sockets = [];
const saveStaleInterval = 5000000;
let socketCount = 0;

const topics = {};
const userMap = {};
const defaultMsg = "{}";
enableWs(app);

function buildUpdate(topic, msg, user) {
  const req = {
    url: `http://localhost:9999/page`,
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
  request.get(`http://localhost:9999/page/${topic}`, (error, res, body) => {
    if (error) {
      failure(error);
    } else {
      body ? success(body) : success('{}');
    }
  });
}

function authorized(user, topic, success, failure) {
  console.log(user);
  request.post(`http://localhost:9999/page`, {
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

const config = {
  authFunc: authorized,
  updateFunc: buildUpdate,
  getFunc: getFunc,
  getUserId: getUserId,
}


function update() {
  let keys = Object.keys(topics);
  console.log('Updating...');
  for (let index = 0; index < keys.length; index += 1) {
    const topic = topics[keys[index]];
    const staleTime = new Date();
    console.log(topic.users);
    console.log(`${topic.lastUpdate.getTime()} < ${staleTime.getTime() + (saveStaleInterval * 2)}`);
    if (topic.lastUpdate.getTime() < staleTime.getTime() + (saveStaleInterval * 2)) {
      console.log('Updated ' + keys[index]);
      const randUser = topic.users[Math.floor(Math.random() * topic.users.length)];
      config.updateFunc(keys[index], topic.message, randUser);
    }
  }
  setTimeout(update, saveStaleInterval);
}

setTimeout(update, saveStaleInterval);

function authSuccess(ws, user, topic) {
  function update() {
    console.log('update!')
    updateTopic(ws, user, topic);
  }
  return update;
}

function authFailure(ws, topic, msg) {
  function deny() {
    ws.Send('{"data": { "content": "Access Denied"}');
    ws.close();
  }
  return deny;
}

function send(socket, pattchObj, content) {

}

function getMessage(topic, user, socket) {
  function sendMessage(msg) {
    topics[topic].message = msg;
    broadCast(topic);
  }
  getFunc(topic, user, sendMessage);
}

function updateTopic (ws, user, topic, patchObj) {
  let topicObj = topics[topic];
  if (topicObj === undefined) {
    topicObj = {
      sockets: [],
      users: [],
      message: defaultMsg,
    }
  }
  topicObj.lastUpdate = new Date();

  if (topicObj.sockets.indexOf(ws) === -1) {
    topicObj.sockets.push(ws);
    topicObj.users.push(user);
    if (topics[topic] === undefined) {
      getMessage(topic, user, ws);
    } else {
      ws.send(`{"content": "${topics[topic].message}"}`);
    }
    topics[topic] = topicObj;
    return;
  }

  const patch = new diff_match_patch().patch_apply(patchObj, topicObj.message);
  topicObj.message = patch[0];
  topics[topic] = topicObj;
  broadCast(topic, patchObj, ws);
}

function broadCast(topic, patchObj, ignore) {
  const sockets = topics[topic].sockets;
  console.log("sockets length: " + sockets.length);
  const openSockets = ignore ? [ignore] : [];
  for (let index = 0; index < sockets.length; index += 1) {
    let socket = sockets[index];
    if (socket !== ignore) {
      let data = {
        patch: patchObj,
        content: topics[topic].message,
      };
      console.log("state: " + socket.readyState);
      if (socket.readyState === 1) {
        socket.send(JSON.stringify(data));
        openSockets.push(socket);
      }
    }
  }
  topics[topic].sockets = openSockets;
}

function onMsg(ws, topic, msg) {
  msgObj = JSON.parse(msg);
  updateTopic(ws, msgObj.user, topic, msgObj.patchObj);
}

function onCreate(ws, user, topic) {
  config.authFunc(user, topic, authSuccess(ws, user, topic), authFailure(ws, user, topic));
}

app.ws('/topic/:identifier', (ws, req) => {
    ws.on('message', msg => {
      const topic = req.params.identifier;
      if (sockets.indexOf(ws) === -1) {
        sockets.push(ws);
        console.log('On Create ' + sockets.length);

        onCreate(ws, JSON.parse(msg), topic);
      } else {
        console.log('On Message ' + sockets.length);
        onMsg(ws, topic, msg);
      }
    });

    ws.on('open', (ws, req) => {
      ws.id = socketCount;
      sockets[socketCount++];
      console.log('opened: ' + req.params.identifier);
    });

    ws.on('close', () => {
        console.log('WebSocket was closed');
        sockets.splice(sockets.indexOf(ws), 1);
    });
});

app.listen(8000)
