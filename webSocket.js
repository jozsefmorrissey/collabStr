const express = require('express');
const enableWs = require('express-ws');
const argsObj = require('command-line-parser')();

const configSrvc = require('./src/config').config();
const logger = require('./src/logger').logger(argsObj.logLevel, argsObj.logFile);
const diff_match_patch = require('./lib/diff-match-patch').diff_match_patch;

const collabConfig = configSrvc('collab');
const propList = configSrvc();
logger.info("Config: \n" + JSON.stringify(propList, null, 2));

const app = express();
const sockets = [];
const saveStaleInterval = 5000000;
let socketCount = 0;

const topics = {};
const userMap = {};
const defaultMsg = "{}";
enableWs(app);


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
      collabConfig.updateFunc(keys[index], topic.message, randUser);
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
  collabConfig.getFunc(topic, user, sendMessage);
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
      logger.debug(`Pulling ${topic} from the database`);
      getMessage(topic, user, ws);
    } else {
      logger.debug(`Content aready saved, sending to new socket`);
      ws.send(`{"content": ${topics[topic].message}}`);
    }
    topics[topic] = topicObj;
    return;
  }

  const patch = new diff_match_patch().patch_apply(patchObj, topicObj.message);
  if (typeof collabConfig.messageValidate === 'function' && collabConfig.messageValidate(patch[0])) {
    logger.debug(`Patched Message: \n${patch[0]}\n`);
    topicObj.message = patch[0];
    topics[topic] = topicObj;
    broadCast(topic, patchObj, ws);
  }
}

function broadCast(topic, patchObj, ignore) {
  logger.debug(`Content ${topic}:\n ${JSON.stringify(topics[topic].content)}`)
  const sockets = topics[topic].sockets;
  logger.debug("sockets length: " + sockets.length);
  const openSockets = ignore ? [ignore] : [];
  for (let index = 0; index < sockets.length; index += 1) {
    let socket = sockets[index];
    if (socket !== ignore) {
      let data = {
        patch: patchObj,
        content: topics[topic].message,
      };
      logger.debug("state: " + socket.readyState);
      if (socket.readyState === 1) {
        socket.send(JSON.stringify(data));
        openSockets.push(socket);
      }
    }
  }
  topics[topic].sockets = openSockets;
}

function onMsg(ws, topic, msgObj) {
  updateTopic(ws, msgObj.user, topic, msgObj.patchObj);
}

function onCreate(ws, user, topic) {
  collabConfig.authFunc(user, topic, authSuccess(ws, user, topic), authFailure(ws, user, topic));
}

app.ws('/topic/:identifier', (ws, req) => {
    ws.on('message', msg => {
      logger.debug("Incomming message: " + msg);
      try {
        const msgObj = JSON.parse(msg);
        logger.debug("JSON parse successful");
        const topic = req.params.identifier;
        if (sockets.indexOf(ws) === -1) {
          sockets.push(ws);
          console.log('On Create ' + sockets.length);
          onCreate(ws, msgObj, topic);
        } else {
          console.log('On Message ' + sockets.length);
          onMsg(ws, topic, msgObj);
        }
      } catch (e) {
        let errorMsg = "All messages must be a valid json string";
        logger.error(e);
        logger.error(errorMsg);
        ws.send(errorMsg);
        ws.close();
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

console.log(configSrvc('PORT'))
app.listen(configSrvc('PORT'))
