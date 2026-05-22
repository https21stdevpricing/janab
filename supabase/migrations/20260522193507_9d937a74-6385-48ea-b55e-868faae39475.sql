CREATE UNIQUE INDEX IF NOT EXISTS bank_transfers_unique_cheque_deposit_idx
ON public.bank_transfers (
  user_id,
  lower(coalesce(bank_name, '')),
  lower(coalesce(cheque_no, ''))
)
WHERE kind = 'cheque_deposit' AND cheque_no IS NOT NULL AND btrim(cheque_no) <> '';
