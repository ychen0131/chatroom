// Require the packages we will use:
var http = require("http"),
	socketio = require("socket.io"),
	path = require('path'),
	url = require('url'),
	util = require('util'),
	mime = require('mime'),
	fs = require("fs");


var users = {};
var rooms = {};
var Files = {};



// Listen for HTTP connections.  This is essentially a miniature static file server that only serves our one file, client.html:
var app = http.createServer(function(req, resp){
	// This callback runs when a new connection is made to our HTTP server.
 
	fs.readFile("client.html", function(err, data){
		// This callback runs when the client.html file has been read from the filesystem.
 
		if(err) return resp.writeHead(500);
		resp.writeHead(200);
		resp.end(data);
	});
	
	
	
	
	
});
app.listen(8000);
 
// Do the Socket.IO magic:
var io = socketio.listen(app);
io.sockets.on("connection", function(socket){
	// This callback runs when a new Socket.IO connection is established.
	
	
	
	socket.on('Start', function (data) { //data contains the variables that we passed through in the html file
	        var Name = data['Name'];
	        Files[Name] = {  //Create a new Entry in The Files Variable
	            FileSize : data['Size'],
	            Data     : "",
	            Downloaded : 0
	        }
	        var Place = 0;
	        try{
	            var Stat = fs.statSync('static/' +  Name);
	            if(Stat.isFile())
	            {
	                Files[Name]['Downloaded'] = Stat.size;
	                Place = Stat.size / 524288;
	            }
	        }
	        catch(er){} //It's a New File
	        fs.open("static/" + Name, "a", 0755, function(err, fd){
	            if(err)
	            {
	                console.log(err);
	            }
	            else
	            {
	                Files[Name]['Handler'] = fd; //We store the file handler so we can write to it later
	                socket.emit('MoreData', { 'Place' : Place, Percent : 0 });
	            }
	        });
	});
	
	
	socket.on('Upload', function (data){
	        var Name = data['Name'];
	        Files[Name]['Downloaded'] += data['Data'].length;
	        Files[Name]['Data'] += data['Data'];
	        if(Files[Name]['Downloaded'] == Files[Name]['FileSize']) //If File is Fully Uploaded
	        {
	            fs.write(Files[Name]['Handler'], Files[Name]['Data'], null, 'Binary', function(err, Writen){
// 	            	
//  					var inp = fs.createReadStream("Temp/" + Name);
//  					var out = fs.createWriteStream("static/" + Name);
//  					out.pipe(inp);
//					readableStream.pipe(inp, out, function(){
// 					    fs.unlink("Temp/" + Name, function () { //This Deletes The Temporary File
					        //Moving File Completed
// 					    });
//					});
    				socket.emit('Done', {});
    				Files[Name]['url']='http://ec2-54-86-20-162.compute-1.amazonaws.com:8080/' +  Name;
    				io.to(data.uploaderRoom).emit('uploadComplete_to_client', {"uploader":data.uploader, "filename":Name, "url":Files[Name]['url']});
	            });
	        }
	        else if(Files[Name]['Data'].length > 10485760){ //If the Data Buffer reaches 10MB
	            fs.write(Files[Name]['Handler'], Files[Name]['Data'], null, 'Binary', function(err, Writen){
	                Files[Name]['Data'] = ""; //Reset The Buffer
	                var Place = Files[Name]['Downloaded'] / 524288;
	                var Percent = (Files[Name]['Downloaded'] / Files[Name]['FileSize']) * 100;
	                socket.emit('MoreData', { 'Place' : Place, 'Percent' :  Percent});
	            });
	        }
	        else
	        {
	            var Place = Files[Name]['Downloaded'] / 524288;
	            var Percent = (Files[Name]['Downloaded'] / Files[Name]['FileSize']) * 100;
	            socket.emit('MoreData', { 'Place' : Place, 'Percent' :  Percent});
	        }
	    });
	
	
	
	
	
	
    
    socket.on('login', function(data){
        if (data.username in users) {
            socket.emit('login_to_client', {"success":false});
        } else {
            users[data.username]={
                "name":data.username,
                "socket":socket,
                "current-room":"",
                "owner":false,
                "message":[]
            };
            socket.emit('login_to_client', {"username":data.username, "success":true});
            socket.emit('updateRooms', {"rooms":rooms});
        }
    });
    
    socket.on('logout', function(data){
		delete users[data.username];

        if (data.inRoom) {
            socket.leave(data.room);
            rooms[data.room].users.splice(rooms[data.room].users.indexOf(data.username), 1);
            io.to(data.room).emit('updateUsersList', {"users":rooms[data.room].users});
            io.to(data.room).emit('message_to_client', {"message":data.username + " left the room.", "sender": "System"});
        }
        
        //if (rooms[data.room]!==undefined) {
        //    if (rooms[data.room].users.length==0) {
        //        destroyRoom(data.room);
        //    }
        //}
        socket.emit('updateRooms', {"rooms":rooms});
        socket.emit('loggedout', {"username":data.username});
    });
    
	
	
	socket.on('createPrivate_to_server', function(data){
		if (data.room in rooms) {
            socket.emit('createPrivate_to_client',{"success":false});
        } else {
			rooms[data.room]={
				"name":data.room,
				"owner":data.owner,
				"pwd":data.pwd,
				"users": [],
				"blocked": []
			};
			rooms[data.room].users.push(data.owner);
			io.sockets.emit('createPrivate_to_client', {"rooms":rooms, "success":true, "isOwner":false});
			socket.join(data.room);
			socket.emit('createPrivate_to_client',{"rooms":rooms, "success":true, "isOwner":true, "room":data.room});
			socket.emit('updateUsersList',{"users": rooms[data.room].users});
		}
	});
	
	socket.on('createPublic_to_server', function(data) {
		if (data.room in rooms) {
            socket.emit('createPublic_to_client', {"success":false});
        } else {
			rooms[data.room]={
				"name":data.room,
				"owner":data.owner,
				"pwd":"",
				"users":[],
				"blocked":[]
			};
			rooms[data.room].users.push(data.owner);
			io.sockets.emit('createPublic_to_client', {"rooms":rooms, "success":true, "isOwner":false});
			socket.join(data.room);
			socket.emit('createPublic_to_client', {"rooms":rooms, "success":true, "isOwner": true, "room":data.room});
			socket.emit('updateUsersList',{"users": rooms[data.room].users}); 
		}
	});
	
	
	socket.on('joinPrivate_to_server', function(data) {
		var isBlocked=false;
		var roomIndex=data.roomName;
		for (var i = 0; i < rooms[roomIndex].blocked.length; i++) {
            if (rooms[roomIndex].blocked[i].name.localeCompare(data.user)==0) {
               isBlocked=true; 
            }
        }
		if (!isBlocked) {
			if(rooms[roomIndex].pwd!==data.pwd){
            	socket.emit('joinPrivate_to_client',{"success":false, "message": "Wrong password!"});
				return;
			}
            rooms[roomIndex].users.push(data.user);
			socket.join(data.roomName);
			io.to(data.roomName).emit('updateUsersList',{"users": rooms[roomIndex].users});
			socket.emit('joinPrivate_to_client', {"success":true, "users":rooms[roomIndex].users, "room": data.roomName, "rooms":rooms});
			io.to(data.roomName).emit('message_to_client', {"message": data.user+ " joined the room.", "sender": "System"});
// 		} else if (rooms[roomIndex].pwd!==data.pwd) {
		} else {
            socket.emit('joinPrivate_to_client',{"success":false, "message":"You are blocked by the room owner."});
		}

	});
    
	
	
	
	socket.on('joinPublic_to_server', function(data) {
		var isBlocked=false;
		var roomIndex=data.roomName;
		for (var i = 0; i < rooms[roomIndex].blocked.length; i++) {
            if (rooms[roomIndex].blocked[i].name.localeCompare(data.user)==0) {
               isBlocked=true; 
            }
        }
		if (!isBlocked) {
            rooms[roomIndex].users.push(data.user);
			socket.join(data.roomName);
			io.to(data.roomName).emit('updateUsersList',{"users": rooms[roomIndex].users});
			socket.emit('joinPublic_to_client', {"success":true, "users":rooms[roomIndex].users, "room": data.roomName, "rooms":rooms});
			io.to(data.roomName).emit('message_to_client', {"message": data.user+ " joined the room.", "sender": "System"});
        } else {
            socket.emit('joinPublic_to_client',{"success":false, "message":"You are blocked by the room owner."});
		}
		
	});
		
    
 
	socket.on('message_to_server', function(data) {
		// This callback runs when the server receives a new message from the client.
 		
		if (data.toUser==="Everyone") {
            io.to(data.room).emit('message_to_client', {"sender":data.user, "message":data.message});
        } else {
			users[data.toUser].socket.emit('message_to_client', {"sender":data.user, "message":data.message});
		}
	});
    
    
    socket.on('self_quit_to_server', function(data) {
		roomIndex=rooms[data.room].name;
        socket.leave(rooms[roomIndex].name);
        rooms[roomIndex].users.splice(rooms[roomIndex].users.indexOf(data.user), 1);
        if (rooms[roomIndex].owner==data.user) {
            destroyRoom(roomIndex);
            io.sockets.emit('deleteRoom_to_client', {"success":true, "message":"Room " + data.room + " has been deleted."});
        } else {
// 			if(rooms[data.room].users.length!==0){
            	io.sockets.to(data.room).emit('updateUsersList', {"users":rooms[roomIndex].users});
				io.sockets.to(data.room).emit('message_to_client', {"message": data.user + " left the room.", "sender":"System"});
//         	}
        }
        socket.emit('self_quit_to_client', {"room":data.room});
        io.sockets.emit('updateRooms',{"rooms":rooms});
    })
    
    
    
	socket.on('kick_to_server',function(data){
		if (data.owner==rooms[data.room].owner) {
			users[data.userKicked].socket.emit('kick_to_client', {"room":data.room});
        }
	});
	
	
	socket.on('block_to_server', function(data){
		if (data.owner==rooms[data.room].owner) {
			rooms[data.room].blocked.push(users[data.userBlocked]);
			users[data.userBlocked].socket.emit('block_to_client', {"room":data.room});
        }
	});






    function leaveRoom(username, room) {
    	io.to(room).emit('message_to_client', {"message":username+ " about to leaveRoom"})
        users[username].socket.leave(rooms[room].name);
        rooms[room].users.splice(rooms[room].users.indexOf(username), 1);
        users[username].socket.emit('self_quit_to_client', {"room":room});
        io.to(rooms[room].name).emit('userleft_to_client', {"userleft": username, "users":rooms[room].users});
        io.sockets.emit("updateRooms", {"rooms":rooms});
    }
    
    
    function destroyRoom(roomIndex) {
        for (var i = 0; i < rooms[roomIndex].users.length; i++) {
            leaveRoom(rooms[roomIndex].users[i], roomIndex);
        }
        delete rooms[roomIndex];
        io.sockets.emit('updateRooms', {"rooms":rooms});
    }
        
        
    
    
    
});




