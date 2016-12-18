var userSubmittedChat = function(){
  var text = document.getElementById('messageInput').value;
  if(text !== ""){
    document.getElementById('messageInput').value = "";
    var date = new Date();
    addChatToPage(text,date,"self");
    var userMessage = {
      message: text,
      date: date.getTime()
    };
    postMessage(userMessage);
  }
};

var addChatToPage = function(text, date, chatSourceClass){
  var chat = document.getElementById('chat');
  var entry = document.createElement('li');
  var pNode = document.createElement('p');
  var timeNode = document.createElement('time');
  var divNode = document.createElement('div');
  var time = date.getHours() + ':' + (date.getMinutes() < 10 ? '0' : '') + date.getMinutes();
  divNode.className = 'msg';
  entry.className = chatSourceClass;
  pNode.appendChild(document.createTextNode(text));
  timeNode.appendChild(document.createTextNode(time));
  divNode.appendChild(pNode);
  divNode.appendChild(timeNode);
  entry.appendChild(divNode);
  chat.appendChild(entry);
  var container = document.getElementById('chatContainer');
  var body = document.getElementsByTagName('body')[0];
  body.scrollTop = body.scrollHeight;
};


function postMessage(message){
  var request = new XMLHttpRequest();
  request.overrideMimeType('application/json');
  request.onreadystatechange = function() {
    if (request.readyState != 4) return;
    if (request.status != 200) {
      console.log("ERROR in /echo");
      var responseBody = request.responseText;
      var result = JSON.parse(responseBody);
      console.log(result.error);
      return;
    }
    var responseBody = request.responseText;
    var result = JSON.parse(responseBody);
    addChatToPage(result.message,new Date(result.date),"other");
  }
  request.open('POST','/echo',true);
  request.setRequestHeader("Content-Type","application/json");
  request.send(JSON.stringify(message));

}

function getHistory(){
  var request = new XMLHttpRequest();
  request.overrideMimeType('application/json');
  request.onreadystatechange = function() {
    if (request.readyState != 4) return;
    if (request.status != 200) {
      console.log("ERROR in /history");
      var responseBody = request.responseText;
      var result = JSON.parse(responseBody);
      console.log(result.error);
      return;
    }
    var responseBody = request.responseText;
    var result = JSON.parse(responseBody);
    for(var i in result){
      message = result[i];
      var cssClass = "other";
      if(message.source === 'user'){
        cssClass = "self";
      }
      addChatToPage(message.message,new Date(message.date),cssClass);
    }
  }
  request.open('GET','/history', true);
  request.send();
}

getHistory();
