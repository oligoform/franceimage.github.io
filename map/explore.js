	/**
	 * Default state
	 * Set initial state with request parm
	 */ 
	var stateObj = { 
		lat: 46.566414,
		lng: 2.4609375,
		zoom: 6,
		selectedPostId: -1
		};
	
	function get_request_parm(name) {
	   if(name=(new RegExp('[?&]'+encodeURIComponent(name)+'=([^&]*)')).exec(location.search)) {
	      return decodeURIComponent(name[1]);
	   }
	   else {
		   return false;
	   }
	}
	
	var view_request = get_request_parm('view');
	if(view_request) {
		var split_view_request = view_request.split(',');
		stateObj.lat = split_view_request[0];
		stateObj.lng = split_view_request[1];
		stateObj.zoom = split_view_request[2];
	}
	
	var postid_request = get_request_parm('popup');
	if(postid_request) {
		stateObj.selectedPostId = postid_request;
	}

	var load_request = get_request_parm('load');
	if(load_request == '') {
		load_request = '/json/places.json';
	}


	/**
	 * Map creation, controls creation and global variable setting
	 */
	// Create map
	var map = new L.Map('mapCanvas', { 
        zoomControl: false,
		zoomsliderControl: true
        });
		
	var mapquest = MQ.mapLayer();		
	map.addLayer(mapquest);
	
	map.setView(new L.LatLng(stateObj.lat, stateObj.lng), stateObj.zoom);

	// Popups
	var tooltipPopup = false;
	var stickyPopup = false;
	
	// Arrays of posts
	var postlist = [];
	var markers = {};	// key: postId	
	var postlistByGlobalId = {}; // key: postId	
	
	// Templates
	var postContentTpl = document.getElementById('postContentTpl').innerHTML;
	var tooltipTpl = document.getElementById('tooltipTpl').innerHTML;
	var stickyTooltipTpl = document.getElementById('stickyTooltipTpl').innerHTML;
	
	// Marker icons
	var markerIcon = L.divIcon({ className : 'circle', iconSize : [ 12, 12 ]});
	var markerHoverIcon = L.divIcon({ className : 'circle hover', iconSize : [ 12, 12 ]});
	var markerSelectedIcon = L.divIcon({ className : 'circle selected', iconSize : [ 12, 12 ]});

	// Draw control
	var isEditing = false;
	var isDeleting = false;
	var editableMarkers = new L.FeatureGroup();
	map.addLayer(editableMarkers);		
	var drawControl = new L.Control.Draw({
		draw: {
			polyline: false,
			polygon: false,
			rectangle: false,
			circle: false,
			marker: {
				icon: markerIcon
			}
		},
	    edit: {
	        featureGroup: editableMarkers
	    }
	});
	map.addControl(drawControl); // hidden 
	
	
	/**
	 * Initial loading
	 */ 
	if(sessionStorage.getItem("dirty") == "1") {
		setEditing(true);
		setDirty();
	}
	
	var sessionPostlist = sessionStorage.getItem("postlist");
	if(sessionPostlist) {
		postlist = $.parseJSON(sessionPostlist);
		processJSON(postlist);
	}
	else {
		if(load_request) {
			$.ajax({
			    url: load_request,
			    //jsonpCallback: "processJSON",
			    jsonp: false,
			    dataType: "jsonp"
			}).done(function(data){
			});
		}
	}
	
	// Parse JSON input. Can be called at initial loading or by selecting an input file
	function processJSON(data) {
		postlist = data;
		markers = {};	// key: postId	
		postlistByGlobalId = {}; // key: postId	
		editableMarkers.clearLayers();
		
		for (var i = 0; i < postlist.length; i++) {
			var m = L.marker([postlist[i].latitude, postlist[i].longitude], { icon: markerIcon });
			postlistByGlobalId[postlist[i].guid] = postlist[i];
			m.postId = postlist[i].guid;
			markers[postlist[i].guid] = m; 
			initMarker(m);
		}
				
		refresh_postlist();	
	}
	
	
	// Parse JSON input. Can be called at initial loading or by selecting an input file
	function processGeoJSON(data) {
		postlist = [];
		markers = {};	// key: postId	
		postlistByGlobalId = {}; // key: postId	
		editableMarkers.clearLayers();

		for (var i = 0; i < data.features.length; i++) {
			var feature = data.features[i];

			var newPost = {
					latitude: feature.geometry.coordinates[1],
					longitude: feature.geometry.coordinates[0],
					guid: feature.properties.guid,
					title: feature.properties.title,
					thumbnail: feature.properties.thumbnail,
					url: feature.properties.url,
					excerpt: feature.properties.excerpt
				};
			
			postlist.push(newPost);
						
			var m = L.marker([newPost.latitude, newPost.longitude], { icon: markerIcon });
			postlistByGlobalId[newPost.guid] = newPost;
			m.postId = newPost.guid;
			markers[newPost.guid] = m; 
			initMarker(m);
		}	
		
		refresh_postlist();	
	}	
	
	
	// Initialize marker
	function initMarker(m) {
		editableMarkers.addLayer(m);
		m.on('click', markerClicked);
		m.on('mouseover', function(e) { 
			map.dragging.disable();
			// Create popup
			if(e.target.postId != stateObj.selectedPostId) {
				tooltipPopup = new L.Rrose({ offset: new L.Point(0,-10), closeButton: false, autoPan: false });		
				tooltipPopup.setContent(Mustache.render(tooltipTpl, postlistByGlobalId[e.target.postId]) );
				tooltipPopup.setLatLng(e.target.getLatLng());
				tooltipPopup.openOn(map);
			}
			// Style marker and post in postlist
			if(e.target.postId != stateObj.selectedPostId) {
				markers[e.target.postId].setIcon(markerHoverIcon);
				markers[e.target.postId]._bringToFront();
				$("div.postContent[data-post_id=" + e.target.postId + "]").addClass('hover');
			}

		});
		m.on('mouseout', function(e) { 
			map.dragging.enable();
			map.closePopup(tooltipPopup);

			if(isDeleting) return;

			// Style marker and post in postlist
			$("div.postContent[data-post_id=" + e.target.postId + "]").removeClass('hover');
			if(e.target.postId != stateObj.selectedPostId) {
				markers[e.target.postId]._resetZIndex();
				markers[e.target.postId].setIcon(markerIcon);
			}
		});

	}

	// Map event handlers
	map.on('moveend', function(e) {
		stateObj.lat = map.getCenter().lat;
		stateObj.lng = map.getCenter().lng;
		stateObj.zoom = map.getZoom();
		
		updateHistory();
	});
	
	map.on('moveend resize', function(e) {
		refresh_postlist();
	});
	
	map.on('popupclose', popupClosed);
	
	function popupClosed(e) {
		if(e.popup === stickyPopup) {
			if (stateObj.selectedPostId != -1) {
				$("div.postContent[data-post_id=" + stateObj.selectedPostId + "]").removeClass("selected");
				markers[stateObj.selectedPostId]._resetZIndex();
				markers[stateObj.selectedPostId].setIcon(markerIcon);
				stateObj.selectedPostId = -1;
				updateHistory();
			}
		}
	}
	
	
	// Marker clicked
	function markerClicked(e) {
		if(isDeleting) return;	
		
		if (stateObj.selectedPostId == -1) {
			stateObj.selectedPostId = e.target.postId;
			$("div.postContent[data-post_id=" + stateObj.selectedPostId + "]").removeClass("hover");
			$("div.postContent[data-post_id=" + stateObj.selectedPostId + "]").addClass("selected");
			markers[stateObj.selectedPostId].setIcon(markerSelectedIcon);
			markers[stateObj.selectedPostId]._bringToFront();
		}
		else {
			if(stateObj.selectedPostId == e.target.postId) {
				$("div.postContent[data-post_id=" + stateObj.selectedPostId + "]").removeClass("selected");
				$("div.postContent[data-post_id=" + stateObj.selectedPostId + "]").addClass("hover");
				markers[stateObj.selectedPostId].setIcon(markerHoverIcon);
				markers[stateObj.selectedPostId]._bringToFront();
				stateObj.selectedPostId = -1;
			}
			else {
				$("div.postContent[data-post_id=" + stateObj.selectedPostId + "]").removeClass("selected");
				markers[stateObj.selectedPostId]._resetZIndex();
				markers[stateObj.selectedPostId].setIcon(markerIcon);
				stateObj.selectedPostId = e.target.postId;
				$("div.postContent[data-post_id=" + stateObj.selectedPostId + "]").addClass("selected");
				markers[stateObj.selectedPostId].setIcon(markerSelectedIcon);
				markers[stateObj.selectedPostId]._bringToFront();
			}
		}
		
		updateStickyPopup();
		
		if (stateObj.selectedPostId != -1) { scrollToSelectedOrFirst(); }
		
		updateHistory();
	}
	
	// Center map on post
	function centerMapOnPost(post_id) {
		map.setView(markers[post_id].getLatLng(), map.getZoom());

		if (stateObj.selectedPostId == -1) {
			stateObj.selectedPostId = post_id;
			$("div.postContent[data-post_id=" + stateObj.selectedPostId + "]").removeClass("hover");
			$("div.postContent[data-post_id=" + stateObj.selectedPostId + "]").addClass("selected");
			markers[stateObj.selectedPostId].setIcon(markerSelectedIcon);
			markers[stateObj.selectedPostId]._bringToFront();
		}
		else {
			if(stateObj.selectedPostId != post_id) {
				$("div.postContent[data-post_id=" + stateObj.selectedPostId + "]").removeClass("selected");
				markers[stateObj.selectedPostId]._resetZIndex();
				markers[stateObj.selectedPostId].setIcon(markerIcon);
				stateObj.selectedPostId = post_id;
				$("div.postContent[data-post_id=" + stateObj.selectedPostId + "]").removeClass("hover");
				$("div.postContent[data-post_id=" + stateObj.selectedPostId + "]").addClass("selected");
				markers[stateObj.selectedPostId].setIcon(markerSelectedIcon);
				markers[stateObj.selectedPostId]._bringToFront();
			}
		}

		updateStickyPopup();
		
		updateHistory();
	}
		
	// Refresh post listing on page load or when the map has moved or when an item has been removed
	function refresh_postlist() {
		var postListContainer = $("#postList");
		
		if (postListContainer[0]) {
			postListContainer.empty();
		
			for (var i = 0; i < postlist.length; i++) {
				if(map.getBounds().contains(markers[postlist[i].guid].getLatLng())) {
					postlist[i].lazyload = true;
					postlist[i].editing = isEditing;
					postListContainer.append( Mustache.render(postContentTpl, postlist[i]) );				
				}
			}
					
			// initial view
			if(stateObj.selectedPostId != -1 && markers[stateObj.selectedPostId]) {
				$("div.postContent[data-post_id=" + stateObj.selectedPostId + "]").addClass("selected");
				markers[stateObj.selectedPostId].setIcon(markerSelectedIcon);
				markers[stateObj.selectedPostId]._bringToFront();
				updateStickyPopup();						
			}
			setTimeout(function(){ scrollToSelectedOrFirst(); }, 200); //timeout needed for firefox

			bind_postContent_events();
		}
	}
	

	// Bind events to postContent 
	function bind_postContent_events() {
		// add event handlers
		$("img.lazy").lazyload({
			effect : "fadeIn"
		});
		
		$("div.postContent").on("click", postClicked);
		
		$("div.postContent").on("mouseenter", function(e) {
			var post_id = $(this).attr("data-post_id");
			if(post_id != stateObj.selectedPostId) {
				tooltipPopup = new L.Rrose({ offset: new L.Point(0,-10), closeButton: false, autoPan: false });	
				var title = postlistByGlobalId[post_id].title;
				tooltipPopup.setContent(title);
				tooltipPopup.setLatLng(markers[post_id].getLatLng());
				tooltipPopup.openOn(map);

				
				markers[post_id].setIcon(markerHoverIcon);
				markers[post_id]._bringToFront();
				$(this).addClass('hover');
			}
			$(this).find(".cmdContainer").show();
		});
					
		$("div.postContent").on("mouseleave", function(e) {
			var post_id = $(this).attr("data-post_id");
			$(this).removeClass('hover');
			if(post_id != stateObj.selectedPostId) {
				map.closePopup(tooltipPopup);

				markers[post_id]._resetZIndex();
				markers[post_id].setIcon(markerIcon);
			}
			$(this).find(".cmdContainer").hide();
		});
		
		$("div.postContent a.centerMap").click(
			function(event) {
				event.stopPropagation();
				event.preventDefault();				

				var post_id = $(this).attr("data-post_id");
				centerMapOnPost(post_id);
			});
		
		$("div.postContent a.editPost").click(
			function(event) {
				event.stopPropagation();
				event.preventDefault();	
				$(this).off("click");

				var post_id = $(this).attr("data-post_id");
				var postContent = $("div.postContent[data-post_id=" + post_id + "]");
				if(isEditing) {
					postContent.off("click", postClicked);
					var editor = $('<div>');
					postContent.append(editor);
					populatePostEditor(editor, post_id);
				}
			});
	}

	
	// Post div clicked
	function postClicked(e) {
		var post_id = $(this).attr("data-post_id");

		$(this).append("<div class='loading'>");
		stateObj.selectedPostId = post_id;
		updateHistory();
	//	_paq.push(['trackLink', postlistByGlobalId[post_id].url, 'link']);
		window.location = postlistByGlobalId[post_id].url;

	}
	
	// Populate div for post browsing
	// DELETE: replaced by template with mustache.js
	function populatePostBrowser(browser, post_id, lazyload) {
		
		var title = $('<h4>');
		title.text(postlistByGlobalId[post_id].title);
		browser.append(title);
		
		var cmdContainer = $('<div class="cmdContainer">');
		browser.append(cmdContainer);
		
		var linkToCenterMap = $('<a href="#" class="centerMap">');
		linkToCenterMap.text("Center map");
		linkToCenterMap.attr('data-post_id', post_id);
		cmdContainer.append(linkToCenterMap);

		var linkToEditPost = $('<a href="#" class="editPost">');
		linkToEditPost.text("Edit");
		linkToEditPost.attr('data-post_id', post_id);
		cmdContainer.append(linkToEditPost);
		if(isEditing) {
			linkToEditPost.css("display", "block");
		}

		var imgContainer = $('<div class="imgContainer">');
		browser.append(imgContainer);

		var img = $('<img class="lazy" height="120" width="160">');
		imgContainer.append(img);
		img.attr('data-original', postlistByGlobalId[post_id].thumbnail);
		if(!lazyload) {
			img.attr('src', postlistByGlobalId[post_id].thumbnail);			
		}
		
		var excerptContainer = $('<div class="excerptContainer">');
		browser.append(excerptContainer);
		excerptContainer.text(postlistByGlobalId[post_id].excerpt);
	}
      

	// populate div for post editing
	function populatePostEditor(editor, post_id) {
		var buttonpressed;
		var form = $('<form>', { id: 'post-editor-' + post_id }).css("color", "#707070").append(
				$('<label>').text("Link:").css("font-weight", "bold"),
				$('<br>'),
				$('<input>', { type: "text", name: "url", value: postlistByGlobalId[post_id].url }).css("width", "100%"),
				$('<br>'),
				$('<label>').text("Title:").css("font-weight", "bold"),
				$('<br>'),
				$('<input>', { type: "text", name: "title", value: postlistByGlobalId[post_id].title }).css("width", "100%"),
				$('<br>'),
				$('<label>').text("Thumbnail url:").css("font-weight", "bold"),
				$('<br>'),
				$('<input>', { type: "text", name: "thumbnail", value: postlistByGlobalId[post_id].thumbnail }).css("width", "100%"),
				$('<br>'),
				$('<label>').text("Description:").css("font-weight", "bold"),
				$('<br>'),
				$('<input>', { type: "text", name: "excerpt", value: postlistByGlobalId[post_id].excerpt }).css("width", "100%"),
				$('<div>').css("text-align", "center").append(
						$('<input>', { type: "submit", name: "save", value: "Save" }).click(function() {
							buttonpressed = $(this).attr('name');
					    }),
						$('<input>', { type: "submit", name: "cancel", value: "Cancel" }).click(function() {
							buttonpressed = $(this).attr('name');
					    })
				)
			);
		
		editor.append(
				$('<hr>'),
				form);

		form.submit(function(event) {
			event.preventDefault();
			event.stopPropagation();
			var post = $("div.postContent[data-post_id=" + post_id + "]");
			if(buttonpressed == 'save') {
				postlistByGlobalId[post_id].title = $("#post-editor-" + post_id + " input[name=title]").val();
				postlistByGlobalId[post_id].thumbnail = $("#post-editor-" + post_id + " input[name=thumbnail]").val();
				postlistByGlobalId[post_id].url = $("#post-editor-" + post_id + " input[name=url]").val();
				postlistByGlobalId[post_id].excerpt = $("#post-editor-" + post_id + " input[name=excerpt]").val();
				
				sessionStorage.setItem("postlist", JSON.stringify(postlist));
				setDirty();
				
				postlistByGlobalId[post_id].editing = isEditing;
				postlistByGlobalId[post_id].lazyload = false;
				post.replaceWith( Mustache.render(postContentTpl, postlistByGlobalId[post_id]) );
			}
			bind_postContent_events();
			editor.remove();
		});
		
	}

	// Close sticky popup and open a new one if needed
	function updateStickyPopup() {
		map.off('popupclose', popupClosed);
		map.closePopup(tooltipPopup);
		map.removeLayer(stickyPopup);
		map.on('popupclose', popupClosed);
		
		if(stateObj.selectedPostId != -1 && markers[stateObj.selectedPostId]) {
			// Create popup			
			stickyPopup = new L.Rrose({ offset: new L.Point(0,-10), closeButton: false, autoPan: false, className: 'sticky' });	
			postlistByGlobalId[stateObj.selectedPostId].lazyload = false;
			stickyPopup.setContent(Mustache.render(stickyTooltipTpl, postlistByGlobalId[stateObj.selectedPostId]) );
			stickyPopup.setLatLng(markers[stateObj.selectedPostId].getLatLng());
			stickyPopup.post_id = stateObj.selectedPostId;
			map.addLayer(stickyPopup);
		}
	}
	
	
	// Search actions (using geonames web services)
	$("#searchform").submit(function( event ) {
		event.preventDefault();
		var query = $("#search").val().trim();
		
		var zipcodePattern = /^(\d{5})?$/;
		
		var items = [];
		if(zipcodePattern.test(query)) {
			var url = "http://api.geonames.org/postalCodeSearchJSON?postalcode=" + query + "&country=FR&maxRows=10&username=franceimage";
			$.getJSON(url, function(data) {	
				if(data.postalCodes.length == 1) {
					var val = data.postalCodes[0];
					map.setView([val.lat, val.lng], 13);
				} else {
					$.each(data.postalCodes, function(key, val) {
						items.push( "<li class='resultItem'><a href='#'  data-lat='" + val.lat + "' data-lng='" + val.lng + "'>" + val.placeName + "</a></li>" );
					});
					populateResults(items);
				}
			});
		}
		else {
			var url = "http://api.geonames.org/searchJSON?fcode=ADM4&country=FR&name_equals=" + encodeURIComponent(query) + "&maxRows=10&lang=en&username=franceimage";
			$.getJSON(url, function(data) {	
				
				if(data.geonames.length == 1) {
					var val = data.geonames[0];
					map.setView([val.lat, val.lng], 13);
				} 
				
				if(data.geonames.length > 1) {
					$.each(data.geonames, function(key, val) {
						items.push( "<li class='resultItem'><a href='#' data-lat='" + val.lat + "' data-lng='" + val.lng + "'>" + val.name + " - " + val.adminName1 + "</a></li>" );
					});
					populateResults(items);
				} 
				
				if(data.geonames.length == 0) {
					var url = "http://api.geonames.org/searchJSON?country=FR&q=" + encodeURIComponent(query) + "&maxRows=10&lang=en&username=franceimage";
					$.getJSON(url, function(data) {	
						if(data.geonames.length == 1) {
							var val = data.geonames[0];
							map.setView([val.lat, val.lng], 13);
						} else {
							$.each(data.geonames, function(key, val) {
								items.push( "<li class='resultItem'><a href='#' data-lat='" + val.lat + "' data-lng='" + val.lng + "'>" + val.name + " - " + val.adminName1 + "</a></li>" );
							});
							populateResults(items);
						}
					});
				}
			});
		}
	
	
		function populateResults(items) {	
			$( "<ul/>", {
			    "class": "",
			    html: items.join( "" )
			  }).appendTo("#searchResults");
			
			$(".resultItem a").click(function(event) {
				event.stopPropagation();
				event.preventDefault();				

				$("#searchResults").html("");
				$("#infoPanel").hide();
				var lat = $(this).data("lat");
				var lng = $(this).data("lng");
				map.setView([lat, lng], 13);
			});
			
			$("#infoPanel").show();
		}
	});
	
	$("#search").bind("mouseup", function(e) {
		setTimeout(function() {
			if($("#search").val() == "") {
				$("#searchResults").html("");
				$("#infoPanel").hide();
			}
		}, 1);
	});
	
	$("#closeInfoPanel").click(function(event) {
		event.stopPropagation();
		event.preventDefault();				

		$("#searchResults").html("");
		$("#infoPanel").hide();
	});
	

	// Utilities
	function updateHistory() {
		// Update history
		var parms = "view=" + map.getCenter().lat + "," + map.getCenter().lng + "," + map.getZoom();
		
		if(stateObj.selectedPostId != -1) {
			parms = parms + "&popup=" + stateObj.selectedPostId;
		}
		
		if(load_request) {
			parms = parms + "&load=" + load_request;
		}
		
		History.replaceState({}, document.title, "?" + parms);				
	}
	
	function scrollToSelectedOrFirst() {
		var success = false;
		var container = $("html,body");
		var padding = parseInt($("#page").css("padding-top")) + parseInt($(".postContent").css("margin-top"));

		if (stateObj.selectedPostId != -1) {
		    var scrollTo = $("div.postContent[data-post_id=" + stateObj.selectedPostId + "]");
			
			if(scrollTo.offset()) {
				container.animate({
					scrollTop: scrollTo.offset().top - padding
				});
				success = true;
			}
		}
		
		if(!success) {
		    var scrollTo = $("div.postContent").first();
			
			if(scrollTo.offset()) {
				container.animate({
					scrollTop: scrollTo.offset().top - padding
				});
			}
		}
	}

	// generate guid
	var guid = (function() {
		  function s4() {
		    return Math.floor((1 + Math.random()) * 0x10000)
		               .toString(16)
		               .substring(1);
		  }
		  return function() {
		    return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
		           s4() + '-' + s4() + s4() + s4();
		  };
		})();
	
	
	
	// Edit mode
	$("#editmode").click(function(e) {
		if($(this).is(':checked')) {			
			setEditing(true);
		}
		else {
			setEditing(false);
		}
	});
	
	
	function setEditing(edit) {
		if(edit) {
			isEditing = true;
			$(".leaflet-draw").css("visibility", "visible");
			$(".editPost").css("display", "block");
			$("#editmode").prop('checked', true);
		}
		else {
			isEditing = false;
			$(".leaflet-draw").css("visibility", "hidden");
			$(".editPost").css("display", "none");
			$("#editmode").prop('checked', false);
		}
	}
	
	
	function setDirty() {
		sessionStorage.setItem("dirty", "1");
		$("#editModeWarning").css("display", "block");
		load_request = false;
		updateHistory();
	}
		
	map.on('draw:created', function (e) {
		var marker = e.layer;
		var newPost = {
			latitude: e.layer.getLatLng().lat,
			longitude: e.layer.getLatLng().lng,
			guid: guid(),
			title: "New link",
			thumbnail: "",
			url: "",
			excerpt: "Click to update"
		};
		postlist.unshift(newPost);
		
		postlistByGlobalId[newPost.guid] = newPost;
		marker.postId = newPost.guid;
		markers[newPost.guid] = marker; 
		initMarker(marker);
		
		sessionStorage.setItem("postlist", JSON.stringify(postlist));
		setDirty();

		refresh_postlist();
		
		var postContent = $("div.postContent[data-post_id=" + newPost.guid + "]");
		postContent.off("click", postClicked);
		var editLink = $("div.postContent[data-post_id=" + newPost.guid + "] a.editPost");
		editLink.off("click");
		var editor = $('<div>');
		postContent.append(editor);
		populatePostEditor(editor, newPost.guid);

	});
	
	map.on('draw:edited', function (e) {
		var layers = e.layers;
	    layers.eachLayer(function (marker) {
			postlistByGlobalId[marker.postId].latitude = marker.getLatLng().lat;
			postlistByGlobalId[marker.postId].longitude = marker.getLatLng().lng;
	    });
		
		sessionStorage.setItem("postlist", JSON.stringify(postlist));
		setDirty();
	});
	

	map.on('draw:deletestart', function (e) {
		isDeleting = true;
	});
	
	
	map.on('draw:deleted', function (e) {
		var layers = e.layers;
	    layers.eachLayer(function (marker) {
			var index;
			var postId = marker.postId;
			var post = postlistByGlobalId[postId];
				
			index = postlist.indexOf(post);
			if (index > -1) {
				postlist.splice(index, 1);
			}

			delete postlistByGlobalId[postId];
			delete markers[postId];
	    });
		
		sessionStorage.setItem("postlist", JSON.stringify(postlist));
	    setDirty();
		
		refresh_postlist();
		
		isDeleting = false;
	});
	
	$(".leaflet-draw a").click(function(e) {
		e.stopPropagation();	
	});
	
	
	
	// Import, export and clear
	$("#exportJSON").on('click', function (event) {
		jsonpData = 'data:application/javascript;charset=utf-8,' + encodeURIComponent('processJSON(' + JSON.stringify(postlist) + ');');

		$(this).attr({
			'href': jsonpData,
			'target': '_blank'
		});
		
		$("#editModeWarning").css("display", "none");
		sessionStorage.removeItem("dirty");
	});

	$("#importJSON").on('click', function (event) {
		event.preventDefault();
		$("#importJSONinput").click();
	});
	
	var fileInput = document.querySelector('#importJSONinput');
	fileInput.onchange = function() {

	    var reader = new FileReader();

	    reader.onload = function() {
	        eval(reader.result);
			$("#editModeWarning").css("display", "none");
			sessionStorage.clear();
			sessionStorage.setItem("postlist", JSON.stringify(postlist));
			stateObj.selectedPostId = -1;
			map.removeLayer(stickyPopup);
			load_request = false;
			updateHistory();
	    };

	    reader.readAsText(fileInput.files[0]);    
	};
	
	$("#resetData").on('click', function (event) {
		event.preventDefault();
		$("#editModeWarning").css("display", "none");
		sessionStorage.clear();
		stateObj.selectedPostId = -1;
		map.removeLayer(stickyPopup);
		load_request = false;
		updateHistory();
		processJSON([]);
	});
	
	

	