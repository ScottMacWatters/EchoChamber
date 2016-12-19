console.log('Starting...');
var express = require('express');
var fb_admin = require("firebase-admin");
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var http = require('https');

console.log('Initializing Firebase DB Connection...');

var firebase_config = {
  "type": "service_account",
  "project_id": process.env.firebase_project_id,
  "private_key_id": process.env.firebase_private_key_id,
  "private_key": process.env.firebase_private_key,
  "client_email": process.env.firebase_client_email,
  "client_id": process.env.firebase_client_id,
  "auth_uri": process.env.firebase_auth_uri,
  "token_uri": process.env.firebase_token_uri,
  "auth_provider_x509_cert_url": process.env.firebase_auth_provider_x509_cert_url,
  "client_x509_cert_url": process.env.firebase_client_x509_cert_url
};

var firebase_database_url = process.env.firebase_database_url;

console.log(firebase_database_url);


//todo: externalize the databaseUrl here.
fb_admin.initializeApp({
  credential: fb_admin.credential.cert(firebase_config),
  databaseURL: firebase_database_url
});
var db = fb_admin.database()
console.log('Done.');

console.log('initialiing Express...');
var expr = express();
expr.use(cookieParser());
expr.use(bodyParser.json());

expr.get('/*',function(req,res){
  console.log(req.url);
  var cookie = req.cookies.echoChamberUserCookie;
  if (cookie === undefined)
  {
    var randomNumber=Math.random().toString();
    randomNumber=randomNumber.substring(2,randomNumber.length);
    var year = 3600000 * 24 * 7 *52;
    res.cookie('echoChamberUserCookie',randomNumber, { maxAge: year, httpOnly: true });
    console.log('New: ' + randomNumber);
    saveUserCookieInDb(randomNumber,req.ip);
  }
  else{
    console.log('Existing: ' + cookie);
  }
  req.next();
});

//todo: this always responds
expr.post('/echo/',function(req,res){
  var cookie = req.cookies.echoChamberUserCookie;
  var message = req.body.message;
  var date = req.body.date;
  var errorMessage = 'Request did not include all necessary data.';
  if(cookie && message && date){
    try{
      saveChat(cookie, 'user', message, date, {origin: 'web'});
      getEcho(cookie, message,function(echo,extras){
        var echoDate = new Date().getTime();
        saveChat(cookie, 'echo', echo, echoDate, extras);
        res.setHeader('Content-Type', 'application/json');
        var response = {
          message: echo,
          date: echoDate
        };
        res.send(JSON.stringify(response));
        req.next();
      });
      return;
    }
    catch(e){
      console.log('Error in get /echo/');
      console.log(e);
      errorMessage = 'Internal Server Error.';
    }
  }
  res.setHeader('Content-Type', 'application/json');
  res.status(500);
  res.send(JSON.stringify({ error: errorMessage}));
  req.next();
});


expr.get('/history/', function(req,res){
    var cookie = req.cookies.echoChamberUserCookie;
    var errorMessage = 'Request did not include all necessary data.';
    if(cookie){
      try{
        getMessages(cookie, function(messages){
          res.setHeader('Content-Type','application/json');
          res.send(JSON.stringify(messages));
          req.next();
        });
        return;
      }
      catch(e){
        console.log('Error in get /history/');
        console.log(e);
        errorMessage = 'Internal Server Error.';
      }
    }
    res.setHeader('Content-Type', 'application/json');
    res.status(500);
    res.send(JSON.stringify({ error: errorMessage}));
});

expr.use(express.static('public',{extensions : ['html'], index: "chat.html"}));

var envPort = process.env.PORT ? process.env.PORT : 3000;

var ports = [envPort];
for(var i in ports){
  expr.listen(ports[i], function(){
    console.log('port ' + ports[i] + ' open.');
  });
}
console.log('Done.');
console.log('Fully Started.');


function saveUserCookieInDb(userCookie,ip){
  var userRef = db.ref('user');
  userRef.child(userCookie).set({ip: ip});
};

function saveChat(userCookie,source,message,date,extras){
  var userRef = db.ref('user');

  var chat = {
    source: source,
    message: message,
    date: date,
    extras: extras
  };
  userRef.child(userCookie).child('message').push(chat);
};

function getMessages(userCookie,callback){
  var userRef = db.ref('user/' + userCookie + '/message/').orderByChild('date');
  userRef.once('value').then(function(snapshot){
    var values = snapshot.val();
    var messages = [];
    for(var i in values){
      messages.push(values[i]);
    }
    callback(messages);
  });
}

function getEcho(userCookie,message,callback){
  var encodedMessage = encodeURI(message);
  var redditSearchUrl = '/search.json?q=' + encodedMessage + '&restrict_sr=&sort=relevance&t=year&type=self,link';
  var randomIndex = Math.floor(Math.random() * 4);

  redditRequest(redditSearchUrl,function(searchData){
    try{
      var numResults = searchData.data.children.length;
      var chosenIndex = Math.min(numResults-1, randomIndex);
      var permalinkFull = searchData.data.children[chosenIndex].data.permalink;
      var permalinkTokens = permalinkFull.split('?');
      var newPath = '';
      for(var i = 0; i < permalinkTokens.length; i++){
        if(i == 1){
          newPath += '.json?';
        }
        newPath += permalinkTokens[i];
      }

      redditRequest(newPath, function(postData){
        var randomCommentIndex = Math.floor(Math.random() * 4);
        try{
          var numComments = postData[1].data.children.length;
          var chosenIndex = Math.min(numComments-1, randomCommentIndex);

          var comment = postData[1].data.children[chosenIndex].data;
          console.log(comment);
          //var body = comment.body_html; //todo: decode this?
          var body = comment.body;
          var author = comment.author;

          callback(body, { origin: 'Reddit', author: author});
        }
        catch(e){
          console.log(e);
          callback("I couldn't agree more.",{ origin: 'Error Response'});
        }
      });

    }
    catch(e){
      console.log(e);
      callback('I agree with your point',{ origin: 'Error Response'});
    }
  });
};

function redditRequest(path, completeCallback){
  var responseText = '';
  var redditProtocol = 'https:';
  var redditBase = 'www.reddit.com';
  var options = {
    protocol: redditProtocol,
    host: redditBase,
    path: path,
    method: 'GET'
  };

  function responseCallback(response){
    response.on('data', function(data){
      responseText += data;
    });

    response.on('end', function(){
      completeCallback(JSON.parse(responseText));
    });
  }

  http.request(options,responseCallback).end();
};
