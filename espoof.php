<?php
$to = "evanricafort@gmail.com";
$subject = "Email Spoofing Test";
$txt = "Test Email Spoofing.";
$headers = "From: support@cellbrokerage.com";
mail($to,$subject,$txt,$headers);
?>