<?php

// Synthetic unsafe data flow for local parser and future scanner workflow checks.
$accountId = $_GET['account_id'] ?? '';
$query = "SELECT * FROM accounts WHERE id = '" . $accountId . "'";
mysqli_query($db, $query);
