-- Automatically create one annual rent invoice for each year in an active
-- contract term. Existing invoices for the same contract/year are preserved.
create or replace function public.create_contract_annual_payments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  charge_date date;
begin
  if new.status <> 'aktif' then
    return new;
  end if;

  charge_date := new.tanggal_mulai;
  while charge_date < new.tanggal_berakhir loop
    insert into public.payments (
      contract_id,
      periode,
      jumlah,
      tanggal_jatuh_tempo,
      status
    ) values (
      new.id,
      extract(year from charge_date)::integer::text,
      new.harga_sewa,
      charge_date,
      case when charge_date < current_date then 'terlambat'::public.payment_status else 'belum_bayar'::public.payment_status end
    )
    on conflict (contract_id, periode) do update
      set jumlah = excluded.jumlah,
          tanggal_jatuh_tempo = excluded.tanggal_jatuh_tempo
      where public.payments.status = 'belum_bayar';

    charge_date := (charge_date + interval '1 year')::date;
  end loop;

  return new;
end;
$$;

-- Backfill annual invoices for active contracts already in the database.
insert into public.payments (contract_id, periode, jumlah, tanggal_jatuh_tempo, status)
select
  contracts.id,
  extract(year from annual_dates.charge_date)::integer::text,
  contracts.harga_sewa,
  annual_dates.charge_date::date,
  case when annual_dates.charge_date::date < current_date then 'terlambat'::public.payment_status else 'belum_bayar'::public.payment_status end
from public.contracts
cross join lateral generate_series(
  contracts.tanggal_mulai::timestamp,
  (contracts.tanggal_berakhir - 1)::timestamp,
  interval '1 year'
) as annual_dates(charge_date)
where contracts.status = 'aktif'
  and contracts.tanggal_berakhir > contracts.tanggal_mulai
on conflict (contract_id, periode) do nothing;

drop trigger if exists contracts_create_annual_payments on public.contracts;
create trigger contracts_create_annual_payments
after insert or update of tanggal_mulai, tanggal_berakhir, harga_sewa, status
on public.contracts
for each row execute function public.create_contract_annual_payments();
