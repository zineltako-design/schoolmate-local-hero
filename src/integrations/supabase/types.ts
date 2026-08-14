export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      abonnements: {
        Row: {
          created_at: number | null
          date_paiement: string | null
          devise: string | null
          ecole_code: string | null
          ecole_id: string | null
          ecole_nom: string | null
          id: string
          licence_key_id: string | null
          mode_paiement: string | null
          montant: number | null
          notes: string | null
          periode_debut: string | null
          periode_fin: string | null
          plan: string | null
          reference: string | null
          statut: string | null
          updated_at: number | null
        }
        Insert: {
          created_at?: number | null
          date_paiement?: string | null
          devise?: string | null
          ecole_code?: string | null
          ecole_id?: string | null
          ecole_nom?: string | null
          id: string
          licence_key_id?: string | null
          mode_paiement?: string | null
          montant?: number | null
          notes?: string | null
          periode_debut?: string | null
          periode_fin?: string | null
          plan?: string | null
          reference?: string | null
          statut?: string | null
          updated_at?: number | null
        }
        Update: {
          created_at?: number | null
          date_paiement?: string | null
          devise?: string | null
          ecole_code?: string | null
          ecole_id?: string | null
          ecole_nom?: string | null
          id?: string
          licence_key_id?: string | null
          mode_paiement?: string | null
          montant?: number | null
          notes?: string | null
          periode_debut?: string | null
          periode_fin?: string | null
          plan?: string | null
          reference?: string | null
          statut?: string | null
          updated_at?: number | null
        }
        Relationships: []
      }
      annonces_plateforme: {
        Row: {
          active: boolean | null
          auteur: string | null
          cible: string | null
          contenu: string | null
          created_at: number | null
          date_debut: string | null
          date_fin: string | null
          ecoles_ids: Json | null
          id: string
          label_action: string | null
          lien_action: string | null
          nb_vues: number | null
          priorite: string | null
          titre: string | null
          type: string | null
          updated_at: number | null
        }
        Insert: {
          active?: boolean | null
          auteur?: string | null
          cible?: string | null
          contenu?: string | null
          created_at?: number | null
          date_debut?: string | null
          date_fin?: string | null
          ecoles_ids?: Json | null
          id: string
          label_action?: string | null
          lien_action?: string | null
          nb_vues?: number | null
          priorite?: string | null
          titre?: string | null
          type?: string | null
          updated_at?: number | null
        }
        Update: {
          active?: boolean | null
          auteur?: string | null
          cible?: string | null
          contenu?: string | null
          created_at?: number | null
          date_debut?: string | null
          date_fin?: string | null
          ecoles_ids?: Json | null
          id?: string
          label_action?: string | null
          lien_action?: string | null
          nb_vues?: number | null
          priorite?: string | null
          titre?: string | null
          type?: string | null
          updated_at?: number | null
        }
        Relationships: []
      }
      archives_eleves: {
        Row: {
          annee_scolaire: string | null
          archive_at: string | null
          classe_id: string | null
          classe_nom: string | null
          classe_suivante_id: string | null
          created_at: number | null
          decision: string | null
          ecole_code: string
          eleve_id: string | null
          id: string
          matricule: string | null
          niveau: string | null
          nom: string | null
          prenom: string | null
          sexe: string | null
          statut_paiement: string | null
          updated_at: number | null
        }
        Insert: {
          annee_scolaire?: string | null
          archive_at?: string | null
          classe_id?: string | null
          classe_nom?: string | null
          classe_suivante_id?: string | null
          created_at?: number | null
          decision?: string | null
          ecole_code: string
          eleve_id?: string | null
          id: string
          matricule?: string | null
          niveau?: string | null
          nom?: string | null
          prenom?: string | null
          sexe?: string | null
          statut_paiement?: string | null
          updated_at?: number | null
        }
        Update: {
          annee_scolaire?: string | null
          archive_at?: string | null
          classe_id?: string | null
          classe_nom?: string | null
          classe_suivante_id?: string | null
          created_at?: number | null
          decision?: string | null
          ecole_code?: string
          eleve_id?: string | null
          id?: string
          matricule?: string | null
          niveau?: string | null
          nom?: string | null
          prenom?: string | null
          sexe?: string | null
          statut_paiement?: string | null
          updated_at?: number | null
        }
        Relationships: []
      }
      archives_finances: {
        Row: {
          annee_scolaire: string | null
          archive_at: string | null
          classe_nom: string | null
          created_at: number | null
          ecole_code: string
          eleve_id: string | null
          eleve_nom: string | null
          id: string
          montant_du: number | null
          montant_paye: number | null
          nb_paiements: number | null
          reste: number | null
          statut: string | null
          updated_at: number | null
        }
        Insert: {
          annee_scolaire?: string | null
          archive_at?: string | null
          classe_nom?: string | null
          created_at?: number | null
          ecole_code: string
          eleve_id?: string | null
          eleve_nom?: string | null
          id: string
          montant_du?: number | null
          montant_paye?: number | null
          nb_paiements?: number | null
          reste?: number | null
          statut?: string | null
          updated_at?: number | null
        }
        Update: {
          annee_scolaire?: string | null
          archive_at?: string | null
          classe_nom?: string | null
          created_at?: number | null
          ecole_code?: string
          eleve_id?: string | null
          eleve_nom?: string | null
          id?: string
          montant_du?: number | null
          montant_paye?: number | null
          nb_paiements?: number | null
          reste?: number | null
          statut?: string | null
          updated_at?: number | null
        }
        Relationships: []
      }
      classes: {
        Row: {
          created_at: number | null
          ecole_code: string
          id: string
          niveau: string | null
          nom: string | null
          updated_at: number | null
        }
        Insert: {
          created_at?: number | null
          ecole_code: string
          id: string
          niveau?: string | null
          nom?: string | null
          updated_at?: number | null
        }
        Update: {
          created_at?: number | null
          ecole_code?: string
          id?: string
          niveau?: string | null
          nom?: string | null
          updated_at?: number | null
        }
        Relationships: []
      }
      comptabilite_banque: {
        Row: {
          categorie: string | null
          created_at: number | null
          created_by: string | null
          date_ecriture: string | null
          ecole_code: string
          id: string
          libelle: string | null
          montant: number | null
          notes: string | null
          reference: string | null
          type: string | null
          updated_at: number | null
        }
        Insert: {
          categorie?: string | null
          created_at?: number | null
          created_by?: string | null
          date_ecriture?: string | null
          ecole_code: string
          id: string
          libelle?: string | null
          montant?: number | null
          notes?: string | null
          reference?: string | null
          type?: string | null
          updated_at?: number | null
        }
        Update: {
          categorie?: string | null
          created_at?: number | null
          created_by?: string | null
          date_ecriture?: string | null
          ecole_code?: string
          id?: string
          libelle?: string | null
          montant?: number | null
          notes?: string | null
          reference?: string | null
          type?: string | null
          updated_at?: number | null
        }
        Relationships: []
      }
      comptabilite_caisse: {
        Row: {
          categorie: string | null
          created_at: number | null
          created_by: string | null
          date_ecriture: string | null
          ecole_code: string
          id: string
          libelle: string | null
          montant: number | null
          notes: string | null
          reference: string | null
          type: string | null
          updated_at: number | null
        }
        Insert: {
          categorie?: string | null
          created_at?: number | null
          created_by?: string | null
          date_ecriture?: string | null
          ecole_code: string
          id: string
          libelle?: string | null
          montant?: number | null
          notes?: string | null
          reference?: string | null
          type?: string | null
          updated_at?: number | null
        }
        Update: {
          categorie?: string | null
          created_at?: number | null
          created_by?: string | null
          date_ecriture?: string | null
          ecole_code?: string
          id?: string
          libelle?: string | null
          montant?: number | null
          notes?: string | null
          reference?: string | null
          type?: string | null
          updated_at?: number | null
        }
        Relationships: []
      }
      comptabilite_config: {
        Row: {
          annee_scolaire: string | null
          created_at: number | null
          date_debut_exercice: string | null
          devise: string | null
          ecole_code: string
          id: string
          solde_initial_banque: number | null
          solde_initial_caisse: number | null
          updated_at: number | null
        }
        Insert: {
          annee_scolaire?: string | null
          created_at?: number | null
          date_debut_exercice?: string | null
          devise?: string | null
          ecole_code: string
          id: string
          solde_initial_banque?: number | null
          solde_initial_caisse?: number | null
          updated_at?: number | null
        }
        Update: {
          annee_scolaire?: string | null
          created_at?: number | null
          date_debut_exercice?: string | null
          devise?: string | null
          ecole_code?: string
          id?: string
          solde_initial_banque?: number | null
          solde_initial_caisse?: number | null
          updated_at?: number | null
        }
        Relationships: []
      }
      config_scolarite: {
        Row: {
          created_at: number | null
          ecole_code: string
          id: string
          montant_annuel: number | null
          niveau: string | null
          updated_at: number | null
        }
        Insert: {
          created_at?: number | null
          ecole_code: string
          id: string
          montant_annuel?: number | null
          niveau?: string | null
          updated_at?: number | null
        }
        Update: {
          created_at?: number | null
          ecole_code?: string
          id?: string
          montant_annuel?: number | null
          niveau?: string | null
          updated_at?: number | null
        }
        Relationships: []
      }
      depenses: {
        Row: {
          categorie: string | null
          created_at: number | null
          date_depense: string | null
          description: string | null
          ecole_code: string
          id: string
          montant: number | null
          motif: string | null
          par: string | null
          updated_at: number | null
        }
        Insert: {
          categorie?: string | null
          created_at?: number | null
          date_depense?: string | null
          description?: string | null
          ecole_code: string
          id: string
          montant?: number | null
          motif?: string | null
          par?: string | null
          updated_at?: number | null
        }
        Update: {
          categorie?: string | null
          created_at?: number | null
          date_depense?: string | null
          description?: string | null
          ecole_code?: string
          id?: string
          montant?: number | null
          motif?: string | null
          par?: string | null
          updated_at?: number | null
        }
        Relationships: []
      }
      ecole_config: {
        Row: {
          adresse: string | null
          annee_scolaire: string | null
          code_ecole: string | null
          configured: boolean | null
          created_at: number | null
          date_rentree: string | null
          devise: string | null
          ecole_code: string
          email: string | null
          frais_inscription: number | null
          frais_reinscription: number | null
          id: string
          logo_url: string | null
          matricule_prefix: string | null
          montants_echeances: Json | null
          nb_tranches: number | null
          nom: string | null
          telephone: string | null
          type_echeancier: string | null
          updated_at: number | null
          ville: string | null
        }
        Insert: {
          adresse?: string | null
          annee_scolaire?: string | null
          code_ecole?: string | null
          configured?: boolean | null
          created_at?: number | null
          date_rentree?: string | null
          devise?: string | null
          ecole_code: string
          email?: string | null
          frais_inscription?: number | null
          frais_reinscription?: number | null
          id: string
          logo_url?: string | null
          matricule_prefix?: string | null
          montants_echeances?: Json | null
          nb_tranches?: number | null
          nom?: string | null
          telephone?: string | null
          type_echeancier?: string | null
          updated_at?: number | null
          ville?: string | null
        }
        Update: {
          adresse?: string | null
          annee_scolaire?: string | null
          code_ecole?: string | null
          configured?: boolean | null
          created_at?: number | null
          date_rentree?: string | null
          devise?: string | null
          ecole_code?: string
          email?: string | null
          frais_inscription?: number | null
          frais_reinscription?: number | null
          id?: string
          logo_url?: string | null
          matricule_prefix?: string | null
          montants_echeances?: Json | null
          nb_tranches?: number | null
          nom?: string | null
          telephone?: string | null
          type_echeancier?: string | null
          updated_at?: number | null
          ville?: string | null
        }
        Relationships: []
      }
      ecoles: {
        Row: {
          adresse: string | null
          code: string
          created_at: number | null
          date_creation: string | null
          devise: string | null
          directeur_email: string | null
          directeur_nom: string | null
          email_contact: string | null
          essai_fin: string | null
          id: string
          licence_fin: string | null
          logo_url: string | null
          nb_eleves: number | null
          nb_utilisateurs: number | null
          nom: string | null
          notes_internes: string | null
          pays: string | null
          plan: string | null
          statut: string | null
          telephone: string | null
          updated_at: number | null
          ville: string | null
        }
        Insert: {
          adresse?: string | null
          code: string
          created_at?: number | null
          date_creation?: string | null
          devise?: string | null
          directeur_email?: string | null
          directeur_nom?: string | null
          email_contact?: string | null
          essai_fin?: string | null
          id: string
          licence_fin?: string | null
          logo_url?: string | null
          nb_eleves?: number | null
          nb_utilisateurs?: number | null
          nom?: string | null
          notes_internes?: string | null
          pays?: string | null
          plan?: string | null
          statut?: string | null
          telephone?: string | null
          updated_at?: number | null
          ville?: string | null
        }
        Update: {
          adresse?: string | null
          code?: string
          created_at?: number | null
          date_creation?: string | null
          devise?: string | null
          directeur_email?: string | null
          directeur_nom?: string | null
          email_contact?: string | null
          essai_fin?: string | null
          id?: string
          licence_fin?: string | null
          logo_url?: string | null
          nb_eleves?: number | null
          nb_utilisateurs?: number | null
          nom?: string | null
          notes_internes?: string | null
          pays?: string | null
          plan?: string | null
          statut?: string | null
          telephone?: string | null
          updated_at?: number | null
          ville?: string | null
        }
        Relationships: []
      }
      eleves: {
        Row: {
          classe_id: string | null
          contact_parent: string | null
          created_at: number | null
          date_naissance: string | null
          ecole_code: string
          id: string
          matricule: string | null
          nom: string | null
          nom_parent: string | null
          prenom: string | null
          sexe: string | null
          type_scolarite: string | null
          updated_at: number | null
        }
        Insert: {
          classe_id?: string | null
          contact_parent?: string | null
          created_at?: number | null
          date_naissance?: string | null
          ecole_code: string
          id: string
          matricule?: string | null
          nom?: string | null
          nom_parent?: string | null
          prenom?: string | null
          sexe?: string | null
          type_scolarite?: string | null
          updated_at?: number | null
        }
        Update: {
          classe_id?: string | null
          contact_parent?: string | null
          created_at?: number | null
          date_naissance?: string | null
          ecole_code?: string
          id?: string
          matricule?: string | null
          nom?: string | null
          nom_parent?: string | null
          prenom?: string | null
          sexe?: string | null
          type_scolarite?: string | null
          updated_at?: number | null
        }
        Relationships: []
      }
      licences_keys: {
        Row: {
          activee_par: string | null
          cle: string | null
          created_at: number | null
          date_activation: string | null
          date_expiration: string | null
          date_generation: string | null
          devise: string | null
          duree_jours: number | null
          ecole_code: string | null
          ecole_id: string | null
          ecole_nom: string | null
          id: string
          montant: number | null
          notes: string | null
          plan: string | null
          statut: string | null
          updated_at: number | null
        }
        Insert: {
          activee_par?: string | null
          cle?: string | null
          created_at?: number | null
          date_activation?: string | null
          date_expiration?: string | null
          date_generation?: string | null
          devise?: string | null
          duree_jours?: number | null
          ecole_code?: string | null
          ecole_id?: string | null
          ecole_nom?: string | null
          id: string
          montant?: number | null
          notes?: string | null
          plan?: string | null
          statut?: string | null
          updated_at?: number | null
        }
        Update: {
          activee_par?: string | null
          cle?: string | null
          created_at?: number | null
          date_activation?: string | null
          date_expiration?: string | null
          date_generation?: string | null
          devise?: string | null
          duree_jours?: number | null
          ecole_code?: string | null
          ecole_id?: string | null
          ecole_nom?: string | null
          id?: string
          montant?: number | null
          notes?: string | null
          plan?: string | null
          statut?: string | null
          updated_at?: number | null
        }
        Relationships: []
      }
      matieres: {
        Row: {
          classe_id: string | null
          coefficient: number | null
          created_at: number | null
          ecole_code: string
          id: string
          nom: string | null
          updated_at: number | null
        }
        Insert: {
          classe_id?: string | null
          coefficient?: number | null
          created_at?: number | null
          ecole_code: string
          id: string
          nom?: string | null
          updated_at?: number | null
        }
        Update: {
          classe_id?: string | null
          coefficient?: number | null
          created_at?: number | null
          ecole_code?: string
          id?: string
          nom?: string | null
          updated_at?: number | null
        }
        Relationships: []
      }
      notes: {
        Row: {
          classe_id: string | null
          created_at: number | null
          ecole_code: string
          eleve_id: string | null
          id: string
          matiere_id: string | null
          sequence: number | null
          updated_at: number | null
          valeur: number | null
        }
        Insert: {
          classe_id?: string | null
          created_at?: number | null
          ecole_code: string
          eleve_id?: string | null
          id: string
          matiere_id?: string | null
          sequence?: number | null
          updated_at?: number | null
          valeur?: number | null
        }
        Update: {
          classe_id?: string | null
          created_at?: number | null
          ecole_code?: string
          eleve_id?: string | null
          id?: string
          matiere_id?: string | null
          sequence?: number | null
          updated_at?: number | null
          valeur?: number | null
        }
        Relationships: []
      }
      notes_audit_log: {
        Row: {
          ancienne_valeur: number | null
          created_at: number | null
          date_modification: string | null
          ecole_code: string
          eleve_id: string | null
          id: string
          matiere_id: string | null
          modifie_par_id: string | null
          modifie_par_nom: string | null
          motif: string | null
          note_id: string | null
          nouvelle_valeur: number | null
          sequence: number | null
          statut: string | null
          updated_at: number | null
          valide_par_id: string | null
        }
        Insert: {
          ancienne_valeur?: number | null
          created_at?: number | null
          date_modification?: string | null
          ecole_code: string
          eleve_id?: string | null
          id: string
          matiere_id?: string | null
          modifie_par_id?: string | null
          modifie_par_nom?: string | null
          motif?: string | null
          note_id?: string | null
          nouvelle_valeur?: number | null
          sequence?: number | null
          statut?: string | null
          updated_at?: number | null
          valide_par_id?: string | null
        }
        Update: {
          ancienne_valeur?: number | null
          created_at?: number | null
          date_modification?: string | null
          ecole_code?: string
          eleve_id?: string | null
          id?: string
          matiere_id?: string | null
          modifie_par_id?: string | null
          modifie_par_nom?: string | null
          motif?: string | null
          note_id?: string | null
          nouvelle_valeur?: number | null
          sequence?: number | null
          statut?: string | null
          updated_at?: number | null
          valide_par_id?: string | null
        }
        Relationships: []
      }
      paiements: {
        Row: {
          annule: boolean | null
          caissier_id: string | null
          caissier_nom: string | null
          created_at: number | null
          date_paiement: string | null
          ecole_code: string
          eleve_id: string | null
          id: string
          mode_paiement: string | null
          montant: number | null
          observation: string | null
          tranche_id: string | null
          tranche_label: string | null
          updated_at: number | null
        }
        Insert: {
          annule?: boolean | null
          caissier_id?: string | null
          caissier_nom?: string | null
          created_at?: number | null
          date_paiement?: string | null
          ecole_code: string
          eleve_id?: string | null
          id: string
          mode_paiement?: string | null
          montant?: number | null
          observation?: string | null
          tranche_id?: string | null
          tranche_label?: string | null
          updated_at?: number | null
        }
        Update: {
          annule?: boolean | null
          caissier_id?: string | null
          caissier_nom?: string | null
          created_at?: number | null
          date_paiement?: string | null
          ecole_code?: string
          eleve_id?: string | null
          id?: string
          mode_paiement?: string | null
          montant?: number | null
          observation?: string | null
          tranche_id?: string | null
          tranche_label?: string | null
          updated_at?: number | null
        }
        Relationships: []
      }
      presences: {
        Row: {
          classe_id: string | null
          created_at: number | null
          date_appel: string | null
          ecole_code: string
          eleve_id: string | null
          enregistre_par_id: string | null
          enregistre_par_nom: string | null
          id: string
          justifie: boolean | null
          motif_absence: string | null
          present: boolean | null
          updated_at: number | null
        }
        Insert: {
          classe_id?: string | null
          created_at?: number | null
          date_appel?: string | null
          ecole_code: string
          eleve_id?: string | null
          enregistre_par_id?: string | null
          enregistre_par_nom?: string | null
          id: string
          justifie?: boolean | null
          motif_absence?: string | null
          present?: boolean | null
          updated_at?: number | null
        }
        Update: {
          classe_id?: string | null
          created_at?: number | null
          date_appel?: string | null
          ecole_code?: string
          eleve_id?: string | null
          enregistre_par_id?: string | null
          enregistre_par_nom?: string | null
          id?: string
          justifie?: boolean | null
          motif_absence?: string | null
          present?: boolean | null
          updated_at?: number | null
        }
        Relationships: []
      }
      profils: {
        Row: {
          actif: boolean
          created_at: string
          ecole_code: string
          email: string | null
          nom: string | null
          prenom: string | null
          role: string
          superadmin: boolean
          user_id: string
        }
        Insert: {
          actif?: boolean
          created_at?: string
          ecole_code: string
          email?: string | null
          nom?: string | null
          prenom?: string | null
          role?: string
          superadmin?: boolean
          user_id: string
        }
        Update: {
          actif?: boolean
          created_at?: string
          ecole_code?: string
          email?: string | null
          nom?: string | null
          prenom?: string | null
          role?: string
          superadmin?: boolean
          user_id?: string
        }
        Relationships: []
      }
      utilisateurs: {
        Row: {
          actif: boolean | null
          classe_id: string | null
          created_at: number | null
          ecole_code: string
          email: string | null
          id: string
          matieres_ids: Json | null
          nom: string | null
          prenom: string | null
          role: string | null
          updated_at: number | null
          user_id: string | null
        }
        Insert: {
          actif?: boolean | null
          classe_id?: string | null
          created_at?: number | null
          ecole_code: string
          email?: string | null
          id: string
          matieres_ids?: Json | null
          nom?: string | null
          prenom?: string | null
          role?: string | null
          updated_at?: number | null
          user_id?: string | null
        }
        Update: {
          actif?: boolean | null
          classe_id?: string | null
          created_at?: number | null
          ecole_code?: string
          email?: string | null
          id?: string
          matieres_ids?: Json | null
          nom?: string | null
          prenom?: string | null
          role?: string | null
          updated_at?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_ecole_code: { Args: never; Returns: string }
      current_zean_role: { Args: never; Returns: string }
      ecole_par_code: {
        Args: { p_code: string }
        Returns: {
          code: string
          essai_fin: string
          id: string
          licence_fin: string
          logo_url: string
          nom: string
          statut: string
          ville: string
        }[]
      }
      is_zean_superadmin: { Args: never; Returns: boolean }
      zean_now_ms: { Args: never; Returns: number }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
