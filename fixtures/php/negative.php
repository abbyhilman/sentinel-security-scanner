<?php

// Synthetic safe example: the value is bound as a parameter.
$statement = $pdo->prepare('SELECT * FROM accounts WHERE id = :account_id');
$statement->execute(['account_id' => filter_input(INPUT_GET, 'account_id')]);
