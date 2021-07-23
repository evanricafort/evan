<?php

$ip = $_SERVER['REMOTE_ADDR'];
$browser = $_SERVER['HTTP_USER_AGENT'];

# opens a logfile where we save the query
$fp = fopen('/p/log.txt','a');

fwrite($fp, $ip.' '.$browser."\n");
fwrite($fp, urldecode($_SERVER['QUERY_STRING']). " \n\n");
echo urldecode($_SERVER['QUERY_STRING']);
fclose($fp);
?>
