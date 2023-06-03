<?php
$to = "evanricafort@gmail.com";
$subject = "Email Spoofing Test";
$txt = "Email Spoofing Test by Evan.";
$headers = "From: support@evanricafort.com";
mail($to,$subject,$txt,$headers);
?>