/**
* RANTR Utility Functions
*
* @spartacusrex
*/

/**
 * Draw the main Table view
 */
var MESSAGE_MAXTIME = 0;
var MESSAGE_NUMBER  = 0;
var VIEW_NUMBER  	= 25;
var IS_MINIMA_BROWSER = window.navigator.userAgent.includes('Minima Browser');
var NODE_ADDRESS = '';
var IS_WRITE_MODE = false;
var IS_LOCKED = false;

var __templates = {
	feedItem: Handlebars.compile(document.getElementById("feed-item-template").innerHTML),
};

function createMainTable(maxtime,callback){
	var table = document.getElementById("feed");
	table.innerHTML = "";
	selectRecentMessages(maxtime,VIEW_NUMBER,function(sqlmsg){
		drawCompleteMainTable(table,sqlmsg.rows,callback);
	});
}

async function drawCompleteMainTable(thetable,allrows,callback){

	//Get all the super chatters
	selectAllSuperChatters(async function(superchatters){
		var len = allrows.length;
		for(var i=0;i<len;i++){
			// var tablerow 	= thetable.insertRow(i);
			// var cell1 	 	= tablerow.insertCell(0);
			const children = await selectChildMessages(allrows[i].MESSAGEID);
			const reactions = await getReactions(children.rows);

			const row = await createMessageTable(allrows[i], superchatters, true, 0, reactions);

			if (row) {
				document.getElementById('feed').innerHTML += row;
			}
		}

		if(callback){
			callback();
		}
	});
}

async function createMessageTable(messagerow, allsuperchatters, showactions, depth = 0, reactions = { show: false }){
	//Sanitize and clean the input - allow our custom youtube tag
	var dbmsg 		= decodeStringFromDB(messagerow.MESSAGE).replaceAll("\n","<br>");
	var msg 		= DOMPurify.sanitize(dbmsg,{
		KEEP_CONTENT: false,
		ADD_TAGS: ["reaction","boost","youtube","spotify_track","spotify_podcast","spotify_artist","spotify_album","spotify_playlist"],
	});

	if (msg.includes('<boost></boost>')) {
		return null;
	}

	if (msg.includes('<reaction>')) {
		return;
	}

	var parentid 	= DOMPurify.sanitize(messagerow.PARENTID+"");
	var baseid 		= DOMPurify.sanitize(messagerow.BASEID+"");
	var messageid	= DOMPurify.sanitize(messagerow.MESSAGEID+"");
	var publickey	= DOMPurify.sanitize(messagerow.PUBLICKEY+"");
	var chatter = messagerow.CHATTER ? JSON.parse(messagerow.CHATTER) : false;

	var nodeAddress	= chatter
		&& chatter.hasOwnProperty('message')
		&& chatter.message.node_address
		&& DOMPurify.sanitize(chatter.message.node_address+"");

	var replyTo 	= null;

	var dd 		= new Date(+messagerow.RECDATE);
	var datestr = dd.toDateString()+" "+dd.toLocaleTimeString()+"&nbsp;";
	var prettyPostedAt = moment(dd).fromNow();
	var superChatter = checkInSuperChatters(publickey,allsuperchatters);
	var isParent = parentid === "0x00";
	var uid = MDS.minidappuid;
	var isPosted = !!messagerow.ID;

	//Are they a SUPER CHATTER
	var un = decodeStringFromDB(messagerow.USERNAME);
	var usernameorig = DOMPurify.sanitize(un);
	var renderedIcon = null;
	var username = DOMPurify.sanitize(un+"");

	if (!messagerow.ICON) {
		var _chatter = JSON.parse(messagerow.CHATTER);
		var isMessage =  _chatter.type === 'MESSAGE';
		const getIcon = isMessage && _chatter.message.icon ? _chatter.message.icon : null;	
		if (getIcon !== null) {
			var ic = decodeStringFromDB(getIcon);
			var icon = DOMPurify.sanitize(ic+"");
			renderedIcon = elementToString(renderIcon(icon, usernameorig));
		} else {
			renderedIcon = elementToString(renderIcon(null, usernameorig));
		}
	} else {
		renderedIcon = elementToString(renderIcon(messagerow.ICON, usernameorig));
	}


	//Now start making the Table..
	var userline = "<table width=100%><tr><td class=namefont> <a href='superchatter.html?uid="+MDS.minidappuid
					+"&username="+usernameorig+
					+"&publickey="+publickey+"'>"+username+"</a></td><td style='text-align:right;'>"+datestr+"</td></tr></table>";

	var msgtable = "<table border=0 class=messagetable>"
					+"<tr><td class=messagetableusername>"+userline+"</td></tr>"
					+"<tr><td class=messagetablemessage><div class=messagetablemessagediv>"+msg+"</div></td></tr>";

	//Is this a reply..
	if(parentid != "0x00"){

		//Creatge a unique id..
		var uniqueid = parentid+Math.random();

		//Add a reply row..
		msgtable += "<tr><td class=messagetablereply id="+uniqueid+"></td></tr>";

		fillInReply(uniqueid,parentid);

		replyTo = await getReply(uniqueid, parentid);

		if (typeof replyTo === 'string') {
			replyTo = replyTo.split('%20').join(' ');
		}
	}

	//Finish up the table
	msgtable += "</table>";

	//Are we showing the actions..
	if(showactions){

		//The VIEW buton
		var viewbutton 	= "<button class=solobutton onclick=\"document.location.href='docview.html?uid="
						+MDS.minidappuid+"&baseid="+baseid+"&msgid="+messageid+"'\">VIEW ALL</button>";

		//The reply page
		var replybutton  = "<button class=solobutton onclick=\"document.location.href='reply.html?uid="
						+MDS.minidappuid+"&msgid="+messageid+"'\">REPLY</button>";

		//Rerant link
		var remsg = "RE-CHATTER";
		if(messagerow.RECHATTER !=0 ){
			remsg = "[X] RE-CHATTER";
		}
		var rerantbutton = "<button class=solobutton onclick='requestReChatter(\""+messageid+"\")'>"+remsg+"</button>";

		var delbutton = "";
		if(parentid == "0x00"){
			delbutton 	 = "<button class=solobutton onclick='requestDelete(\""+baseid+"\")'>DELETE ALL</button>";
		}

		//Actions..
		msgtable += "<table class=messagetableactions><tr><td>"+viewbutton+" "+replybutton+" "+rerantbutton+"</td>"
					+"<td style='text-align:right;'>"+delbutton+"</td></tr></table>";
	}

	//Add a break line
	msgtable+="<br>";

	//Store the latest time
	MESSAGE_MAXTIME = messagerow.RECDATE;
	MESSAGE_NUMBER++;

	//Convert SPECIAL tags
	msgtable = convertYouTube(msgtable);

	//Spotify
	msgtable = convertSpotify("track",msgtable);
	msgtable = convertSpotify("artist",msgtable);
	msgtable = convertSpotify("album",msgtable);
	msgtable = convertSpotify("playlist",msgtable);
	msgtable = convertSpotifyPodcast(msgtable);

	let messageConverted = convertYouTube(msg);
	messageConverted = convertSpotify("track",messageConverted);
	messageConverted = convertSpotify("artist",messageConverted);
	messageConverted = convertSpotify("album",messageConverted);
	messageConverted = convertSpotify("playlist",messageConverted);
	messageConverted = convertSpotifyPodcast(messageConverted);

	return __templates.feedItem({
		username: usernameorig,
		icon: renderedIcon,
		messageId: messageid,
		message: messageConverted,
		postedAt: datestr,
		prettyPostedAt: prettyPostedAt,
		replyTo: replyTo,
		username,
		superChatter,
		isParent,
		baseId: baseid,
		publicKey: publickey,
		uid: uid,
		depth,
		isPosted,
		showReactions: reactions.show,
		...reactions,
		nodeAddress,
	});
}

function checkInSuperChatters(publickey,all){
	var len = all.length;
	for(var i=0;i<len;i++){
		var pubk = all[i].PUBLICKEY;
		if(pubk == publickey){
			return true;
		}
	}
	return false;
}

function fillInReply(htmlid,parentid){
	//Now run this async - is fine as does not interact withj anything else
	selectMessage(parentid,function(found,sqlrow){
		var tabletd = document.getElementById(htmlid);
		if(found){
			var reply = "In reply to.. "+decodeStringFromDB(sqlrow.USERNAME)+":"+decodeStringFromDB(sqlrow.MESSAGE);

			//Sanitize it..
			reply = DOMPurify.sanitize(reply);

			//Strip tags..
			reply = reply.replace(/(<([^>]+)>)/gi, "");

			if(reply.length > 180){
				reply = reply.substring(0,180)+"..";
			}

			// tabletd.innerHTML=reply;
		}else{
			// tabletd.innerHTML="Reply not found..";
		}
	});
}

function getReply(htmlid,parentid){
	return new Promise(function(resolve) {
		selectMessage(parentid,function(found, sqlrow){
			if (found) {
				return resolve(sqlrow.USERNAME);
			}

			return resolve(null);
		});
	})
}

function reChatter(msgid) {
	updateRechatter(msgid,function(){
		insertReChatter(msgid,function(){

			if (document.getElementById('re-chatter-warning-checkbox').checked) {
				return setReChatterWarningToDisabled(function() {
					window.location.reload();
				});
			}

			// refresh the page
			window.location.reload();
		});
	});
}

function requestReChatter(msgid){
	var reChatterModal = document.getElementById('re-chatter-modal');
	var reChatterButton = document.getElementById('re-chatter-post-button');

	if (!SHOW_RE_CHATTER_WARNING) {
		return reChatter(msgid);
	}

	reChatterButton.addEventListener('click', function() {
		reChatter(msgid);
	});

	if (reChatterModal) {
		reChatterModal.style.display = 'block';
	}
}

function requestDelete(baseid){
	if(confirm("This will delete the whole thread ?")){
		deleteAllThread(baseid,function(){
			//Jump to home..
			document.location.href="index.html?uid="+MDS.minidappuid;
		});
	}
}

/**
 * Convert youtube tags
 */
function convertYouTube(msg){
	var messageWithYoutube = "";
	var match = msg.match(/(?<=<youtube>)(.*?)(?=<\/youtube>)/);

	if (match) {
		var youtubeId = match[0];

		messageWithYoutube = msg.replace(
			"<youtube>" + youtubeId + "</youtube>",
			`<div class='youtubecontainer' onclick="loadYoutube(this, '${youtubeId}')">
				<div  class="youtube-image" style="background-image: url('https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg')"><span class="youtube-image-play">
						<svg width="79px" height="55px" viewBox="0 0 79 55" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
							<g id="YouTube_full-color_icon_(2017)" fill-rule="nonzero">
									<path d="M76.9526279,8.60046892 C76.0358309,5.21033513 73.3912243,2.55565384 70.0010905,1.64893158 C65.4473298,-0.109102143 21.3403291,-0.970488292 8.54547055,1.69930504 C5.15533676,2.61610199 2.50065547,5.26070859 1.5939332,8.65084238 C-0.461303924,17.6676915 -0.617461647,37.1622202 1.64430666,46.3805632 C2.56110362,49.770697 5.20571022,52.4253783 8.59584401,53.3321005 C17.6126932,55.407487 60.4805068,55.6996531 70.051464,53.3321005 C73.4415978,52.4153036 76.0962791,49.770697 77.0030013,46.3805632 C79.1942468,36.5577387 79.3504045,18.2721731 76.9526279,8.60046892 Z" id="Path" fill="#FF0000"></path>
									<polygon id="Path" fill="#FFFFFF" points="52.269633 27.4905161 31.7172617 15.7031266 31.7172617 39.2779055"></polygon>
							</g>
						</svg>
					</span>
				</div>
			</div>`
		);

		var anotherMatch = msg.match(/(?<=<youtube>)(.*?)(?=<\/youtube>)/);

		if (anotherMatch) {
			return convertYouTube(messageWithYoutube);
		}

		return messageWithYoutube;
	}

	return msg;
}

/**
 * Works with track,artist,album,playlist
 */
function convertSpotifyPodcast(msg){
	var tag = "spotify_podcast";

	var starttag 	= "<"+tag+">";
	var endtag 		= "</"+tag+">";

	var actual =  msg.replaceAll(starttag,
		"<iframe style='border-radius:12px' src='https://open.spotify.com/embed/episode/");

	//And the end tags
	actual =  actual.replaceAll(endtag,"?utm_source=generator' width='100%' height='352' "
		+"frameBorder='0' allowfullscreen=''; allow='clipboard-write; encrypted-media; "
		+"fullscreen; picture-in-picture' loading='lazy'></iframe>");

	return actual;
}

/**
 * Works with track,artist,album,playlist
 */
function convertNodeAddress(msg){
	const matcher = msg.match(/(?<=<node_address>)(.*?)(?=<\/node_address>)/gmi);

	return {
		nodeAddress: matcher ? matcher[0] : null,
		message: msg.replace(/<node_address>[a-z|0-9]+<\/node_address>/gmi, ''),
		result: /<node_address>[a-z|0-9]+<\/node_address>/gmi.test(msg),
	}
}

/**
 * Works with track,artist,album,playlist
 */
function convertSpotify(type,msg){

	//Which tag
	var tag = "spotify_"+type;

	//Search and replace the youtube tags..
	var starttag 	= "<"+tag+">";
	var endtag 		= "</"+tag+">";

	var actual =  msg.replaceAll(starttag,
			"<iframe style='border-radius:12px' src='https://open.spotify.com/embed/"+type+"/");

	//And the end tags
	actual =  actual.replaceAll(endtag,"?utm_source=generator' width='100%' height='352' "
			+"frameBorder='0' allowfullscreen=''; allow='clipboard-write; encrypted-media; "
			+"fullscreen; picture-in-picture' loading='lazy'></iframe>");

	return actual;
}

function createReplyTable(baseid, callback){
	MDS.sql("SELECT * FROM MESSAGES WHERE baseid='"+baseid+"' ORDER BY recdate ASC", function(sqlmsg){
		//The complete Chat object
		var treechat = {};

		//The top post id the starter
		treechat.toprant = findRows(sqlmsg.rows,"0x00")[0];

		//And now recurse through the whole tree
		recurseReply(sqlmsg.rows,treechat.toprant);

		//AND.. finally return the Tree object
		callback(treechat);
	});
}

function createHistoryTable(publicKey, callback){
	MDS.sql("SELECT * FROM MESSAGES WHERE publickey='"+publicKey+"' ORDER BY recdate ASC", function(sqlmsg){

		//AND.. finally return the Tree object
		callback(sqlmsg.rows);
	});
}

function recurseReply(allrows,current){
	//Get all the replies..
	current.replies = findRows(allrows,current.MESSAGEID);

	//And cycle through them..
	var len = current.replies.length;
	for(var i=0;i<len;i++){
		//recurse..
		recurseReply(allrows,current.replies[i]);
	}
}

function findRows(allrows,parentid){
	var retarray = [];
	var len = allrows.length;
	for(var i=0;i<len;i++){
		if(allrows[i].PARENTID == parentid){
			retarray.push(allrows[i]);
		}
	}

	return retarray;
}

var MAX_IMAGE_SIZE = 400;
function scaleImageFile(file,callback){

	//What to do when file is loaded
	let reader = new FileReader();
	reader.onload = function() {

		var image = new Image();
        image.onload = function (imageEvent) {

            // Resize the image
            var canvas 		= document.createElement('canvas'),
                max_size 	= MAX_IMAGE_SIZE,
                width 		= image.width,
                height 		= image.height;


			//New width and height
			if(width>MAX_IMAGE_SIZE || height>MAX_IMAGE_SIZE){
	            if (width > height) {
	                if (width > max_size) {
	                    height *= max_size / width;
	                    width = max_size;
	                }
	            } else {
	                if (height > max_size) {
	                    width *= max_size / height;
	                    height = max_size;
	                }
	            }
			}

			//Set the size and draw
            canvas.width  = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(image, 0, 0, width, height);

			//Send this RESIZED image
			callback(canvas.toDataURL("image/jpeg",0.9));
        }

		//Set the Image src
        image.src = reader.result;
	};

	reader.onerror = function() {
		console.log(reader.error);
	};

	//Read the file..
	reader.readAsDataURL(file);
}

function embedFile(){
	input = document.createElement('input');
	input.type = 'file';
	input.onchange = function(){
		files 	= Array.from(input.files);
		file 	= files[0];

		//Is it an image..
		MDS.log(file.name);
		var mmessage = document.getElementById("mainmessage");
		var filename = file.name.toLowerCase();
		if(filename.endsWith(".png")   ||
			filename.endsWith(".jpg")  ||
			filename.endsWith(".webp")  ||
			filename.endsWith(".jfif") ||
			filename.endsWith(".bmp")){

			scaleImageFile(file,function(imagedata){
				MDS.log("IMAGE:"+file.name+" SIZE:"+imagedata.length);
				// mmessage.value 	= mmessage.value+"<div style='width:100%;text-align:center;'><img src='"+imagedata+"'></div>";
				//Move to the end
			  //   mmessage.focus();
			  //   mmessage.setSelectionRange(mmessage.value.length,mmessage.value.length);

					document.getElementById('media-message').value = "<div style='width:100%;text-align:center;'><img src='"+imagedata+"'></div>";
					document.getElementById('media-box').innerHTML = '<img src='+imagedata+'></div>';
					document.getElementById('preview').style.display = 'block';
			});

		}

		/*else if(filename.endsWith(".gif")){

			var reader = new FileReader();
		    reader.readAsDataURL(file);
		    reader.onload = function () {
		      console.log(reader.result);
		      var link = "<div style='width:100%;text-align:center;'><img src='"+imagedata+"'></div>";
		      mmessage.value = mmessage.value+" "+link;

		      //Move to the end
		      mmessage.focus();
		      mmessage.setSelectionRange(mmessage.value.length,mmessage.value.length);
		    };
		    reader.onerror = function (error) {
		      console.log('Error: ', error);
		    };

		}else{

			//Check size..
			if(file.size >= MAX_MESSAGE_LENGTH){
				alert("File too big ("+file.size+")! MAX:"+MAX_MESSAGE_LENGTH+" ");
				return;
			}

			var reader = new FileReader();
		    reader.readAsDataURL(file);
		    reader.onload = function () {
		      console.log(reader.result);
		      var link = "<a download='"+filename+"' href='"+reader.result+"'>"+filename+"</a>";
		      mmessage.value = mmessage.value+" "+link;

		      //Move to the end
		      mmessage.focus();
		      mmessage.setSelectionRange(mmessage.value.length,mmessage.value.length);
		    };
		    reader.onerror = function (error) {
		      console.log('Error: ', error);
		    };
		}*/

	};
	input.click();
}

function addSpotifyTrack() {
	var url = document.getElementById('spoitfy-track-url').value;
	var spotifyUrl = url.lastIndexOf('/');
	var spotifyTrackId = url.substring(spotifyUrl + 1);

	var isPodcast = url.includes('/episode');

	if (isPodcast) {
		document.getElementById("media-message").value = "<spotify_podcast>"+spotifyTrackId+"</spotify_podcast>";
		document.getElementById('spotify-track-modal').style.display = 'none';
		document.getElementById('media-box').innerHTML = "<div class='spotify-preview'>"+convertSpotifyPodcast("<spotify_podcast>"+spotifyTrackId+"</spotify_podcast>")+"</div>";
		document.getElementById('preview').style.display = 'block';

		return;
	}

	document.getElementById("media-message").value = "<spotify_track>"+spotifyTrackId+"</spotify_track>";
	document.getElementById('spotify-track-modal').style.display = 'none';
	document.getElementById('media-box').innerHTML = "<div class='spotify-preview'>"+convertSpotify("track", "<spotify_track>"+spotifyTrackId+"</spotify_track>")+"</div>";
	document.getElementById('preview').style.display = 'block';
}

function addYoutubeVideo() {
	var videoId = '';
	var url = document.getElementById('youtube-url').value;

	// append youtube shortened url
	if (url.includes('youtu.be')) {
		var youtubeUrl = url.lastIndexOf('/');
		videoId = url.substring(youtubeUrl + 1);
	} else {
		videoId = url.split('v=')[1];
		var ampersandPosition = videoId.indexOf('&');

		// remove anything after &;
		if(ampersandPosition != -1) {
			videoId = videoId.substring(0, ampersandPosition);
		}
	}

	document.getElementById("media-message").value = "<youtube>"+videoId+"</youtube>";
	document.getElementById('youtube-modal').style.display = 'none';
	document.getElementById('media-box').innerHTML = "<div class='youtube-preview'>"+convertYouTube("<youtube>"+videoId+"</youtube>")+"</div>";
	document.getElementById('preview').style.display = 'block';
}

function requestBoost(msgid) {
	var boostModal = document.getElementById('boost-modal');
	var boostButton = document.getElementById('boost-post-button');

	if (!SHOW_RE_CHATTER_WARNING) {
		return boost(msgid);
	}

	boostButton.addEventListener('click', function() {
		boost(msgid);
	});

	if (boostModal) {
		boostModal.style.display = 'block';
	}
}

function boost(msgid){
	//Create the Chatter message
	selectMessage(msgid, function(found,chatmsg){

		if(!found){
			return;
		}

		//Get the baseid
		baseid = chatmsg.BASEID;

		createRant('<boost>', msgid, baseid, function(rant){

			//ok - now add this message to OUR DB
			addRantToDB(rant,function(msg){

				rant.boost = true;

				//And post over Maxima
				postRant(rant, function() {
					var now = new Date();
					var recdate = now.getTime();

					updateRecDate(msgid, recdate, function() {
						if (document.getElementById('boost-warning-checkbox').checked) {
							return setReChatterWarningToDisabled(function() {
								//And reload the main table
								document.location.href = "index.html?uid="+MDS.minidappuid;
							});
						}

						//And reload the main table
						document.location.href = "index.html?uid="+MDS.minidappuid;
					});
				});
			});
		});
	});
}

function react(msgid, reaction, reloadOnThisPage = false){
	//Create the Chatter message
	selectMessage(msgid, function(found,chatmsg){

		if(!found){
			return;
		}

		//Get the baseid
		baseid = chatmsg.BASEID;

		createRant('<reaction>'+reaction+'</reaction>', msgid, null, function(rant){

			//ok - now add this message to OUR DB
			addRantToDB(rant,function(msg){

				rant.reaction = true;

				//And post over Maxima
				postRant(rant, function() {
					var now = new Date();
					var recdate = now.getTime();

					updateRecDate(msgid, recdate, function() {
						if (reloadOnThisPage) {
							return window.location.reload();
						}

						//And reload the main table
						document.location.href = "index.html?uid="+MDS.minidappuid;
					});
				});
			});
		});
	});
}

var reactionKeys = [
	'angry', 'sad', 'heart', 'shocked', 'grinning_face', 'thumbs_up',
	'joy', 'celebrate', 'muscle', 'pray', 'fire', 'facepalm', 'cool', 'minima',
	'cold', 'loved', 'pleading', 'starstruck', 'squinting', 'heart_face', 'kissing', 'yum', 'screaming',
	'grinning', 'thinking', 'shushing', 'spiral', 'sleeping', 'nerd', 'weary', 'frowning', 'fearful',
];

function getReactions(messages){
	const reactions = {
		angry: 0,
		sad: 0,
		heart: 0,
		shocked: 0,
		thumbs_up: 0,
		grinning_face: 0,
		joy: 0,
		celebrate: 0,
		muscle: 0,
		pray: 0,
		fire: 0,
		facepalm: 0,
		cool: 0,
		minima: 0,
		cold: 0,
		loved: 0,
		pleading: 0,
		starstruck: 0,
		squinting: 0,
		heart_face: 0,
		kissing: 0,
		yum: 0,
		screaming: 0,
		grinning: 0,
		thinking: 0,
		shushing: 0,
		spiral: 0,
		sleeping: 0,
		nerd: 0,
		weary: 0,
		frowning: 0,
		fearful: 0,
		show: false,
		sad_locked: false,
		angry_locked: false,
		heart_locked: false,
		shocked_locked: false,
		thumbs_up_locked: false,
		grinning_face_locked: false,
		joy_locked: false,
		celebrate_locked: false,
		muscle_locked: false,
		pray_locked: false,
		fire_locked: false,
		facepalm_locked: false,
		cool_locked: false,
		minima_locked: false,
		cold_locked: false,
		loved_locked: false,
		pleading_locked: false,
		starstruck_locked: false,
		squinting_locked: false,
		heart_face_locked: false,
		kissing_locked: false,
		yum_locked: false,
		screaming_locked: false,
		grinning_locked: false,
		thinking_locked: false,
		shushing_locked: false,
		spiral_locked: false,
		sleeping_locked: false,
		nerd_locked: false,
		weary_locked: false,
		frowning_locked: false,
		fearful_locked: false,
		boost: 0,
	};

	for (const messagerow of messages) {
		const message = messagerow.MESSAGE;
		const dbmsg = decodeStringFromDB(message).replaceAll("\n","<br>");
		const msg = DOMPurify.sanitize(dbmsg,{ ADD_TAGS: ["reaction","boost","youtube","spotify_track","spotify_podcast","spotify_artist","spotify_album","spotify_playlist"]});

		for (let reaction of reactionKeys) {
			if (msg.includes(`<reaction>${reaction}</reaction>`)) {
				reactions[reaction] += 1;
				if (MAXIMA_PUBLICKEY === messagerow.PUBLICKEY) {
					reactions[`${reaction}_locked`] = true
				}
			}
		}

		if (msg.includes(`<boost></boost>`)) {
			reactions.boost +=  1;
		}
	}

	for (const reactionType in reactions) {
		if (reactions[reactionType]) {
			reactions['show'] = true;
		}
	}

	return reactions;
}

const openApp = (appName) => {
	MDS.dapplink(appName, function (msg) {
		return window.open(`${MDS.filehost}${msg.uid}/index.html?uid=${msg.sessionid}`, '_blank');
	});
}

const openTipModal = (nodeAddress, username) => {
	document.getElementById('tip__name').textContent = username;
	document.getElementById('tip__modal').style.display = 'flex';
	document.getElementById('tip__node-address').value = nodeAddress;
}

const resetTipUI = () => {
	document.getElementById('tip__name').textContent = '';
	document.getElementById('tip__node-address').value = '';
	document.getElementById('tip__amount').value = '';
	document.getElementById('tip__submit').disabled = true;
	document.getElementById('tip__form').style.display = 'block';
	document.getElementById('tip__node-password').value = '';
	document.getElementById('tip__success-pending').style.display = 'none';
	document.getElementById('tip__success-no-confirmation').style.display = 'none';
	document.getElementById('password-is-hidden').type = 'password';
	document.getElementById('password-is-hidden').value = '';
};

(function () {
	document.querySelectorAll('.tip__dismiss').forEach((item) => {
		item.addEventListener('click', function() {
			resetTipUI();
			document.getElementById('tip__modal').style.display = 'none';
		});
	});

	const tipForm = document.getElementById('tip__form');
	const tipAmount = document.getElementById('tip__amount');
	const passwordIsHidden = document.getElementById('password-is-hidden');
	const nodePassword = document.getElementById('tip__node-password');

	if (passwordIsHidden) {
		passwordIsHidden.addEventListener('click', function() {
			nodePassword.type = nodePassword.type === 'password' ? 'text' : 'password';
			passwordIsHidden.src = nodePassword.type === 'password' ? './assets/eye-off.svg' : './assets/eye.svg';
		});
	}
	if (tipForm) {
		tipForm.addEventListener('submit', function(evt) {
			evt.preventDefault();

			const nodeAddress = document.getElementById('tip__node-address').value;
			const amount = document.getElementById('tip__amount').value;
			const nodePassword = document.getElementById('tip__node-password').value;

			let transactionPassword = '';

			if (nodeAddress === '' || !nodeAddress.includes('Mx') || amount === '') {
				return '';
			}

			if (nodePassword !== '') {
				transactionPassword += ` password:${nodePassword}`;
			}

			document.getElementById('tip__submit').disabled = true;

			MDS.cmd(`send amount:${amount} tokenid:0x00 address:${nodeAddress}${transactionPassword}`, function () {
				resetTipUI();
				document.getElementById('tip__form').style.display = 'none';

				if (IS_WRITE_MODE) {
					return document.getElementById('tip__success-no-confirmation').style.display = 'block';
				}

				return document.getElementById('tip__success-pending').style.display = 'block';
			});
		});
	}

	if (tipAmount) {
		tipAmount.addEventListener('keyup', function() {
			const amount = document.getElementById('tip__amount').value;
			const nodeAddress = document.getElementById('tip__node-address').value;
			const nodePassword = document.getElementById('tip__node-password').value;

			if (nodeAddress === '' || !nodeAddress.includes('Mx') || amount === '') {
				document.getElementById('tip__submit').disabled = true;
				return;
			}

			if (IS_LOCKED === true && nodePassword === '') {
				return;
			}

			return document.getElementById('tip__submit').disabled = false;
		});
	}

	/***
	 *
	 */
	if (nodePassword) {
		nodePassword.addEventListener('keyup', function() {
			const amount = document.getElementById('tip__amount').value;
			const nodeAddress = document.getElementById('tip__node-address').value;
			const nodePassword = document.getElementById('tip__node-password').value;

			if (nodeAddress === '' || !nodeAddress.includes('Mx') || amount === '') {
				document.getElementById('tip__submit').disabled = true;
				return;
			}

			if (IS_LOCKED === true && nodePassword === '') {
				return;
			}

			return document.getElementById('tip__submit').disabled = false;
		});
	}
})();


function openWallet() {
	const nodeAddress = document.getElementById('tip__node-address').value;
	const amount = document.getElementById('tip__amount').value;
	const amountArg = amount !== '' ? `&amount=${amount}` : '';

	dappLink('Wallet', function (msg) {
		window.open(`${msg.base}#/send?tokenid=0x00&address=${nodeAddress}${amountArg}`);
	});
}

const getMaxAmount = () => {
	balance(function (balance) {
		const maxAmount = Number(Number(balance[0].sendable).toFixed(0));
		const balanceText = `Amount (Max: ${maxAmount})`;
		document.getElementById('tip__amount').placeholder = balanceText;
		document.getElementById('tip__amount').max = maxAmount;
	});
};



// render the user's Maxima icon
function renderIcon(maximaIcon, usernameorig) {
	try {
		const dataImageBase64Regex = /^data:image\/(?:png|jpeg|gif|bmp|webp|svg\+xml);base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
		const isBase64 = maximaIcon ? dataImageBase64Regex.test(decodeURIComponent(maximaIcon)) : false;
	
		if (isBase64) {
			const div = document.createElement('div');
			div.className = 'avatar';
	
			const img = document.createElement('img');
			img.src = decodeURIComponent(maximaIcon);
			img.alt = 'maxima-icon';
	
			div.appendChild(img);
			return div;
		}
	
		const regexp = /[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{1F9B0}-\u{1F9B3}]/gu;
		const nameEmojiMatches = usernameorig.match(regexp);
	
		if (nameEmojiMatches && nameEmojiMatches.length > 0) {
			const span = document.createElement('span');
			span.className = 'avatar';
			span.textContent = nameEmojiMatches[0];
			return span;
		}
		
		const defaultDiv = document.createElement('div');
		defaultDiv.className = 'avatar';
		defaultDiv.textContent = usernameorig.charAt(0).toUpperCase();
		return defaultDiv;
	} catch (error) {
		
		const defaultDiv = document.createElement('div');
		defaultDiv.className = 'avatar';
		defaultDiv.textContent = usernameorig.charAt(0).toUpperCase();
		return defaultDiv;
	}


}
// helper method for renderIcon
function elementToString(element) {
    const wrapper = document.createElement('div');
    wrapper.appendChild(element);
    return wrapper.innerHTML;
}