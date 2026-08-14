ALTER TABLE public.ecole_config
  ADD COLUMN IF NOT EXISTS frais_inscription numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS frais_reinscription numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS date_rentree text,
  ADD COLUMN IF NOT EXISTS nb_tranches numeric DEFAULT 3;