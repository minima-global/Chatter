/**
* CHATTER backend service
*
* @spartacusrex
*/

//Load a file..
MDS.load("chatter.js");

//Are we logging data
var logs = false;

//Main message handler..
MDS.init(function(msg){

	//Do initialisation
	if(msg.event == "inited"){

		//Create the DB if not exists
		createDB(function(msg){
			MDS.log("SQL DB inited");
		});

		//Run Maxima to get the User details..
		MDS.cmd("maxima",function(msg){
			MAXIMA_PUBLICKEY = msg.response.publickey;
			MAXIMA_USERNAME  = msg.response.name;
		});

	//Check rechatter messages
	}else if(msg.event == "MDS_TIMER_10SECONDS"){

		//Check the rechatter table
		doRechatter();

	//Do a Resync requset..
	}else if(msg.event == "MDS_TIMER_1HOUR"){

		//Current time
		var currentdate = new Date();

		//12 hour MAX..
		var maxdatetime = currentdate.getTime() - (1000 * 60 * 60 * 48);

		//First select all the messages you have sent in the last 24 hours..
		MDS.sql("SELECT DISTINCT messageid FROM MESSAGES WHERE (publickey='"+MAXIMA_PUBLICKEY+
				"' OR rechatter=1) AND recdate>"+maxdatetime
				+" ORDER BY recdate DESC LIMIT 50", function(sqlmsg){

			//How many messages
			var len = sqlmsg.rows.length;

			//Send these messages..
			var msglist = [];
			for(var i=0;i<len;i++){
				msglist.unshift(sqlmsg.rows[i].MESSAGEID);
			}

			//Send a message to each contact
			MDS.cmd("maxcontacts",function(resp){

				//For each contact
				var len = resp.response.contacts.length;
				for(var i=0;i<len;i++){

					//Get the contact public key
					var pubkey  = resp.response.contacts[i].publickey;

					//Send them a message
					var chatter  		= {};
					chatter.type		= "MESSAGE_SYNCLIST";
					chatter.synclist	= msglist;

					//Send the request
					postMessageToPublickey(chatter,pubkey);

					if(logs){
						MDS.log("CHATTER 1 HOUR RESYNC SENT TO  : "+pubkey+" "+JSON.stringify(chatter));
					}
				}
			});
		});

	//Only interested in Maxima
	}else if(msg.event == "MAXIMA"){

		//Is it for maxsolo..
		if(msg.data.application == "chatter"){

			//The Maxima user that sent this request
			var publickey = msg.data.from;

			//Convert the data..
			MDS.cmd("convert from:HEX to:String data:"+msg.data.data,function(resp){

				//And create the actual JSON
				var rantjson = JSON.parse(resp.response.conversion);

				if(logs){
					MDS.log("RECEIVED CHATTER MESSAGE : "+JSON.stringify(rantjson));
				}

				//What message type is this..
				var messagetype = rantjson.type;

				if(messagetype == "MESSAGE"){

					MDS.log(JSON.stringify(rantjson));

					//Check this rant
					checkRant(rantjson,function(valid){
						//Only add valif rants
						if(valid){

							//Do we have the parent..
							var parentid = rantjson.message.parentid;
							if(parentid != "0x00"){

								//Do we have it..
								checkInDB(parentid,function(pindb){
									if(!pindb){

										//Create a request message
										createMessageRequest(parentid,function(chatterreq){

											//Post it normally over Maxima to JUST this user
											postMessageToPublickey(chatterreq,publickey,function(postresp){
												if(logs){
													MDS.log("POST REQUEST:"+JSON.stringify(postresp));
												}
											});
										});
									} else {
										if (rantjson.boost || rantjson.reaction) {
											updateRecDate(parentid, rantjson.message.date, function (res) {
												MDS.log(res);
												MDS.log('SEEING MESSAGE!');
											});
										}
									}
								});
							}

							//Do we already have it..
							checkInDB(rantjson.messageid,function(indb){
								if(!indb){

									//Add it to the DB
									addRantToDB(rantjson,function(sqlmsg){

										//Did it work..
										if(sqlmsg.status){

											//Send a Notification
											var usen  = decodeStringFromDB(rantjson.message.username);
											var msg   = decodeStringFromDB(rantjson.message.message);
											if(msg.length > 100){
												msg = msg.substring(0,100)+"..";
											}
											var notif = usen+":"+msg;

											//Notify..
											MDS.notify(notif);

											//Are they a SUPER CHATTER
											isSuperChatter(rantjson.message.publickey,function(found){

												if(found){
													//Rerant it..
													updateRechatter(rantjson.messageid,function(){
														MDS.comms.solo("NEWCHATTER");

														//And rechatter to db
														insertReChatter(rantjson.messageid,function(sqlmsg){});
													});

												}else{
													//And reload the main table
													MDS.comms.solo("NEWCHATTER");
												}
											});
										}
									});

								}else{
									if(logs){
										MDS.log("CHATTER Message already in DB "+rantjson.messageid);
									}
								}
							});
						}
					});

				}else if(messagetype=="MESSAGE_REQUEST"){

					var msgid = rantjson.messageid;

					//Load the message
					selectMessage(msgid,function(found,chatmsg){
						if(!found){
							MDS.log("MESSAGE REQUEST for unknown msgid "+msgid);
							return;
						}

						//Convert to JSON
						var chatjson = JSON.parse(chatmsg.CHATTER);

						postMessageToPublickey(chatjson,publickey,function(postresp){
							if(logs){
								MDS.log("POST REQUEST REPLY:"+JSON.stringify(postresp));
							}
						});
					});


				}else if(messagetype=="MESSAGE_SYNCLIST"){

					//Get the full message list
					var msglist = rantjson.synclist;

					//Now search for any you DON'T have - MAX 50..
					var len = msglist.length;
					if(len>50){
						len = 50;
					}

					for(var i=0;i<len;i++){

						//Do we have it..
						checkInDB(msglist[i],function(indb){
							if(!indb){

								//Create a request message
								createMessageRequest(msglist[i],function(chatterreq){

									//Post it normally over Maxima to JUST this user
									postMessageToPublickey(chatterreq,publickey,function(postresp){
										if(logs){
											MDS.log("POST SYNC REQUEST:"+JSON.stringify(postresp));
										}
									});
								});
							}
						});
					}

				}else{
					MDS.log("INVALID Message type in Chatter message "+messagetype);
				}
			});
		}
	}
});
