/**
* RANTR Utility Functions
*
* @spartacusrex
*/

/**
 * Global variables
 */
var MAXIMA_PUBLICKEY = "";
var MAXIMA_USERNAME  = "";
var MAXIMA_CONTACT   = "";

var MAX_MESSAGE_LENGTH = 250000;

var SHOW_BOOST_WARNING = true;
var SHOW_RE_CHATTER_WARNING = true;
var SHOW_SUPER_CHATTER_WARNING = true;

/**
 * Initilaise Username, Publickey - does not HAVE to be Maxima details..use maxcreate etc
 */
function initChatter(callback){
	//Run Maxima to get the User details..
	MDS.cmd("maxima",function(msg){
		MAXIMA_PUBLICKEY = msg.response.publickey;
		MAXIMA_USERNAME  = msg.response.name;

		//Hack for now..
		MAXIMA_CONTACT	 = msg.response.contact;

		if(callback){
			callback();
		}
	});
}

/**
 * Create the main SQL DB
 */
function createDB(callback){

	//Create the DB if not exists
	var initsql = "CREATE TABLE IF NOT EXISTS `messages` ( "
			+"  `id` bigint auto_increment, "
			+"  `chatter` clob(256K) NOT NULL, "
			+"  `publickey` varchar(512) NOT NULL, "
			+"  `username` varchar(512) NOT NULL, "
			+"  `message` varchar(250000) NOT NULL, "
			+"  `messageid` varchar(160) NOT NULL, "
			+"  `parentid` varchar(160) NOT NULL, "
			+"  `baseid` varchar(160) NOT NULL, "
			+"  `rechatter` int NOT NULL default 0, "
			+"  `favourite` int NOT NULL default 0, "
			+"  `msgdate` bigint NOT NULL, "
			+"  `recdate` bigint NOT NULL "
			+" )";

	//Run this..
	MDS.sql(initsql,function(msg){

		//Create the Super Chatter table
		var initsuper = "CREATE TABLE IF NOT EXISTS `superchatter` ( "
						+"  `id` bigint auto_increment, "
						+"  `publickey` varchar(512) NOT NULL, "
						+"  `username` varchar(512) NOT NULL, "
						+"  `rechat` int NOT NULL default 0 "
						+" )";

		MDS.sql(initsuper,function(msg){

			//Create the Super Chatter table
			var rechatter = "CREATE TABLE IF NOT EXISTS `rechatter` ( "
							+"  `id` bigint auto_increment, "
							+"  `messageid` varchar(160) NOT NULL, "
							+"  `recdate` bigint NOT NULL "
							+" )";

			MDS.sql(rechatter,function(msg){

				//Delete OLD messages
				var timenow  = (new Date()).getTime();
				var monthago = timenow - (1000 * 60 * 60 * 24 * 50);

				MDS.sql("DELETE FROM messages WHERE favourite = 0 AND recdate < "+monthago,function(sqlmsg){
					//MDS.log(JSON.stringify(sqlmsg));
					if(callback){
						callback(msg);
					}
				});
			});
		});
	});
}

/**
 * Create settings table
 * @param callback
 */
function createSettingsTable(callback){

	//Create the DB if not exists
	// var settingsSchema = "DROP TABLE `settings`";
	// MDS.sql(settingsSchema, callback);

	//Create the DB if not exists
	var settingsSchema = "CREATE TABLE IF NOT EXISTS `settings` ( "
		+"  `id` bigint auto_increment, "
		+"  `k` varchar(512) NOT NULL, "
		+"  `v` varchar(512) NOT NULL "
		+" )";

	MDS.sql(settingsSchema, callback);
}

/**
 * Select All Unique Users
 */
function selectSuperChatter(publickey,callback){
	MDS.sql("SELECT publickey,username FROM SUPERCHATTER WHERE publickey='"+publickey+"'", function(sqlmsg){
		callback(sqlmsg);
	});
}

function isSuperChatter(publickey,callback){
	MDS.sql("SELECT publickey FROM SUPERCHATTER WHERE publickey='"+publickey+"'", function(sqlmsg){
		if(sqlmsg.count>0){
			callback(true);
		}else{
			callback(false);
		}
	});
}

function selectAllSuperChatters(callback){
	MDS.sql("SELECT publickey FROM SUPERCHATTER", function(sqlmsg){
		callback(sqlmsg.rows);
	});
}

/**
 * Select All the recent messages
 */
function selectRecentMessages(maxtime, limit,callback){
	MDS.sql("SELECT * FROM MESSAGES WHERE recdate<"+maxtime+" AND message NOT LIKE '%reaction%' AND message NOT LIKE '%boost%' ORDER BY recdate DESC LIMIT "+limit, function(sqlmsg){
		callback(sqlmsg);
	});
}

/**
 * Select All the recent messages
 */
function selectChildMessages(parentId){
	return new Promise(resolve => {
		MDS.sql("SELECT * FROM MESSAGES WHERE PARENTID = '" + parentId + "'", function(sqlmsg){
			resolve(sqlmsg);
		});
	});
}

/**
 * Select a single message
 */
function selectMessage(msgid,callback){
	MDS.sql("SELECT * FROM MESSAGES WHERE messageid='"+msgid+"'", function(sqlmsg){
		//Did we find it..
		if(sqlmsg.rows.length>0){
			callback(true, sqlmsg.rows[0]);
		}else{
			callback(false);
		}
	});
}

/**
 * Delete a Single Message
 */
function deleteMessage(msgid,callback){
	MDS.sql("DELETE FROM MESSAGES WHERE messageid='"+msgid+"'", function(sqlmsg){
		if(callback){
			callback(sqlmsg);
		}
	});
}

/**
 * Delete a whole thread
 */
function deleteAllThread(baseid,callback){
	MDS.sql("DELETE FROM MESSAGES WHERE baseid='"+baseid+"'", function(sqlmsg){
		if(callback){
			callback(sqlmsg);
		}
	});
}

/**
 * Update message details
 */
function updateRechatter(msgid,callback){
	MDS.sql("UPDATE MESSAGES SET rechatter=1 WHERE messageid='"+msgid+"'", function(sqlmsg){
		if(callback){
			callback(sqlmsg);
		}
	});
}

/**
 * Select All the recent messages
 */
function selectRechatterMessages(callback){
	MDS.sql("SELECT * FROM RECHATTER ORDER BY recdate ASC", function(sqlmsg){
		if(callback){
			callback(sqlmsg);
		}
	});
}

function deleteRechatter(messageid, callback){
	MDS.sql("DELETE FROM RECHATTER WHERE messageid='"+messageid+"'", function(sqlmsg){
		if(callback){
			callback(sqlmsg);
		}
	});
}

/**
 * Find the base message for a given message
 */
function havebasemsg(msgid,callback){
	MDS.sql("SELECT * FROM MESSAGES WHERE messageid='"+msgid+"'", function(sqlmsg){

		//Did we find it
		if(sqlmsg.count>0){
			var messagerow 	= sqlmsg.rows[0];
			var parentid 	= messagerow.PARENTID;
			if(parentid == "0x00"){
				callback(true);
			}else{
				havebasemsg(parentid,callback)
			}
		}else{
			//Not found..
			callback(false);
		}
	});
}

/**
 * Insert a message into the rechatter table
 */
function insertReChatter(messageid,callback){

	//Date as of NOW
	var recdate = new Date();

	//The SQL to insert
	var insertsql = "INSERT INTO rechatter(messageid,recdate) VALUES ('"+messageid+"',"+recdate.getTime()+")";

	MDS.sql(insertsql, function(sqlmsg){
		if(callback){
			callback(sqlmsg);
		}
	});
}

/**
 * REchatter valid messages
 */
function doRechatter(){

	//The cut off date - try for 5 mins..
	var timenow  	= (new Date()).getTime();
	var minsago 	= timenow - (1000 * 60 * 5);

	//First delete the old messages
	MDS.sql("DELETE FROM RECHATTER WHERE recdate<"+minsago,function(sqlmsg){

		//Fits get all the messages
		selectRechatterMessages(function(rechats){
			//MDS.log(JSON.stringify(rechats));

			var len = rechats.rows.length;
			for(var i=0;i<len;i++){

				//Are we ready to rechatter - do we have the base msg
				checkReadyRechatter(rechats.rows[i].MESSAGEID);
			}
		});
	});
}

function checkReadyRechatter(messageid){
	//Do we have the baseid..
	havebasemsg(messageid,function(basemsg){

		//Did we find it..
		if(basemsg){

			//We can rechatter ther message
			rechatter(messageid,function(sqlmsg){

				//Now delete it..
				deleteRechatter(messageid,function(){});
			});
		}
	});
}

/**
 * Create a Chatter message
 */
function createRant(basemessage,parentid,baseid,callback){

	//URL Encode everything..
	var message  = encodeStringForDB(basemessage);
	var username = encodeStringForDB(MAXIMA_USERNAME);

	if(message.length > MAX_MESSAGE_LENGTH){
		MDS.log("MESSAGE TOO LONG! for createRant..");
		//Too long..
		callback(null);
		return;
	}

	//Construct the base message JSON..
	var msgjson = {};

	msgjson.publickey 	= MAXIMA_PUBLICKEY;
	msgjson.username 	= username;
	msgjson.message 	= message;
	msgjson.parentid 	= parentid;
	msgjson.baseid 		= baseid;
	msgjson.date 		= (new Date()).getTime();

	//Make the HASH unique - even for the same message at the same time
	msgjson.randomid 	= Math.random()+"";

	//Convert to a string
	var msgstr = JSON.stringify(msgjson);

	//Calculate the msgid
	MDS.cmd("hash data:"+msgstr,function(hashmsg){

		//The HASH of the message
		var msgid 	= hashmsg.response.hash;

		//Sign this message
		MDS.cmd("maxsign data:"+msgid,function(msg){

			//The signatrure of the hash
			var signature = msg.response.signature;

			//Now the actual CHATTER message
			var chatter  = {};
			chatter.type		= "MESSAGE"
			chatter.message		= msgjson;
			chatter.messageid 	= msgid;
			chatter.signature 	= signature;

			//MDS.log("CHATTER:"+JSON.stringify(chatter,null,2));

			//Now we have a RANT
			if(callback){
				callback(chatter);
			}
		});
	});
}

/**
 * Create message request
 */
function createMessageRequest(msgid,callback){
	//Now the actual CHATTER message
	var chatter  = {};
	chatter.type		= "MESSAGE_REQUEST";
	chatter.messageid 	= msgid;

	//Now we have a RANT
	if(callback){
		callback(chatter);
	}
}

/**
 * Check a RANT
 */
function checkRant(chatter,callback){
	//Convert to a string
	var msgstr = JSON.stringify(chatter.message);

	//Calculate the msgid
	MDS.cmd("hash data:"+msgstr,function(msg){
		var msgid 	= msg.response.hash;

		//Check this is valid..
		if(msgid != chatter.messageid){
			MDS.log("INVALID MESSAGEID in Chatter message "+JSON.stringify(chatter));
			callback(false);
			return;
		}

		//Now verify the signature
		MDS.cmd("maxverify data:"+msgid+" publickey:"+chatter.message.publickey+" signature:"+chatter.signature,function(msg){
			if(!msg.response.valid){
				MDS.log("INVALID SIGNATURE in Chatter message "+JSON.stringify(chatter));
				callback(false);
				return;
			}

			//All good
			callback(true);
		});
	});
}

/**
 * Post a message Over Chatter
 */
function postRant(chatter,callback){
	//TEST
	//var maxcmd = "maxima action:send to:"+MAXIMA_CONTACT+" application:chatter data:"+JSON.stringify(rant);

	var maxcmd = "maxima action:sendall application:chatter data:"+JSON.stringify(chatter);
	MDS.cmd(maxcmd,function(msg){
		//MDS.log(JSON.stringify(msg));
		if(callback){
			callback(msg);
		}
	});
}

/**
 * Post a message to a Maxima Contact
 */
function postMessageToPublickey(chatter,publickey,callback){
	var maxcmd = "maxima action:send poll:true publickey:"+publickey+" application:chatter data:"+JSON.stringify(chatter);
	MDS.cmd(maxcmd,function(msg){
		//MDS.log(JSON.stringify(msg));
		if(callback){
			callback(msg);
		}
	});
}

function rechatter(msgid,callback){
	//First load the message
	selectMessage(msgid,function(found,chatmsg){
		if(!found){
			MDS.log("RECHATTER unknown msgid : "+msgid);
			if(callback){
				callback(null);
			}
			return;
		}

		//Convert to JSON
		var chatjson = JSON.parse(chatmsg.CHATTER);

		//And post as normal..
		postRant(chatjson,function(msg){
			//MDS.log("RERANT:"+JSON.stringify(msg));
			if(callback){
				callback(msg);
			}
		});
	});
}

/*
 * Do we already have this Chatter message
 */
function checkInDB(msgid,callback){
	MDS.sql("SELECT id FROM MESSAGES WHERE messageid='"+msgid+"'", function(sqlmsg){
		callback(sqlmsg.count>0);
	});
}

function encodeStringForDB(str){
	return encodeURIComponent(str).split("'").join("%27");
	//return encodeURIComponent(str).replaceAll("'", "%27");
}

function decodeStringFromDB(str){
	return decodeURIComponent(str).split("%27").join("'");
	//return decodeURIComponent(str).replaceAll("%27", "'");
}

/**
 * Add a Chatter message to the DB - it has already ben checked!
 */
function addRantToDB(chatter,callback){

	//What is the striung of the message
	var fullchat = JSON.stringify(chatter);

	//Get the actual rant
	var msgjson = chatter.message;

	//Date as of NOW
	var recdate = new Date();

	//Is this a TOP message
	var baseid = msgjson.baseid;
	if(msgjson.parentid == "0x00"){
		baseid = chatter.messageid;
	}

	//The SQL to insert
	var insertsql = "INSERT INTO messages(chatter,publickey,username,message,messageid,parentid,baseid,msgdate,recdate) VALUES "+
						"('"+fullchat+"','"
							+msgjson.publickey+"','"
							+msgjson.username+"','"
							+msgjson.message+"','"
							+chatter.messageid+"','"
							+msgjson.parentid+"','"
							+baseid+"',"
							+msgjson.date+","+recdate.getTime()+")";

	MDS.sql(insertsql, function(sqlmsg){
		if(callback){
			callback(sqlmsg);
		}
	});
}

function requestUserToBeSuperChatter(pubkey, username) {
	if (!SHOW_SUPER_CHATTER_WARNING) {
		return makeUserASuperChatter(pubkey, username);
	}

	document.getElementById('make-super-chatter-modal').style.display = 'block';
	document.getElementById('make-super-chatter-button').addEventListener('click', function() {
		if (document.getElementById('make-super-chatter-warning-checkbox').checked) {
			var query = "SELECT * FROM settings WHERE key = 'SHOW_SUPER_CHATTER_WARNING'";

			return MDS.sql(query,function(msg){
				if (msg.count === 0) {
					query = `INSERT INTO settings (k, v) VALUES ('SHOW_SUPER_CHATTER_WARNING', '1')`;
				} else {
					query = `UPDATE settings SET v = '1' WHERE k 'SHOW_SUPER_CHATTER_WARNING'`;
				}

				return MDS.sql(query,function(){
					SHOW_SUPER_CHATTER_WARNING = false;

					makeUserASuperChatter(pubkey, username);
				});
			});
		}

		makeUserASuperChatter(pubkey, username);
	});
}

function makeUserASuperChatter(pubkey, username){
	var sql = "INSERT INTO superchatter (publickey,username) VALUES ('"+pubkey+"','"+username+"')";

	MDS.sql(sql,function(){
		window.location.reload(true);
	});
}

/**
 * @param pubkey
 * @param username
 */
function removeUserSuperChatter(pubkey, username){
	var sql = "DELETE FROM superchatter WHERE publickey='"+pubkey+"'";

	MDS.sql(sql,function(){
		window.location.reload(true);
	});
}

function checkWarnings() {
	var query = "SELECT * FROM settings WHERE k = 'SHOW_RE_CHATTER_WARNING'";

	MDS.sql(query,function(msg){
		if (msg.count > 0) {
			SHOW_RE_CHATTER_WARNING = false;
		}

		var query = "SELECT * FROM settings WHERE k = 'SHOW_SUPER_CHATTER_WARNING'";

		MDS.sql(query,function(msg){
			if (msg.count > 0) {
				SHOW_SUPER_CHATTER_WARNING = false;
			}

			var query = "SELECT * FROM settings WHERE k = 'SHOW_BOOST_WARNING'";

			MDS.sql(query,function(msg){
				if (msg.count > 0) {
					SHOW_BOOST_WARNING = false;
				}
			});
		});
	});
}

function setReChatterWarningToDisabled(callback) {
	var query = "SELECT * FROM settings WHERE key = 'SHOW_RE_CHATTER_WARNING'";

	MDS.sql(query,function(msg){
		if (msg.count === 0) {
			query = `INSERT INTO settings (k, v) VALUES ('SHOW_RE_CHATTER_WARNING', '1')`;
		} else {
			query = `UPDATE settings SET v = '1' WHERE k 'SHOW_RE_CHATTER_WARNING'`;
		}

		SHOW_RE_CHATTER_WARNING = false;

		MDS.sql(query, callback);
	});
}

function setBoostWarningToDisabled(callback) {
	var query = "SELECT * FROM settings WHERE key = 'SHOW_BOOST_WARNING'";

	MDS.sql(query,function(msg){
		if (msg.count === 0) {
			query = `INSERT INTO settings (k, v) VALUES ('SHOW_BOOST_WARNING', '1')`;
		} else {
			query = `UPDATE settings SET v = '1' WHERE k 'SHOW_BOOST_WARNING'`;
		}

		SHOW_BOOST_WARNING = false;

		MDS.sql(query, callback);
	});
}
