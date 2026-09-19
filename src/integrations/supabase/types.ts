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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      allergies: {
        Row: {
          category: string | null
          created_at: string
          criticality: string | null
          fhir_id: string | null
          id: string
          patient_mrn: string
          reaction: string | null
          substance: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          criticality?: string | null
          fhir_id?: string | null
          id?: string
          patient_mrn: string
          reaction?: string | null
          substance?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          criticality?: string | null
          fhir_id?: string | null
          id?: string
          patient_mrn?: string
          reaction?: string | null
          substance?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "allergies_patient_mrn_fkey"
            columns: ["patient_mrn"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["mrn"]
          },
        ]
      }
      appointments: {
        Row: {
          appointment_type: string | null
          created_at: string
          description: string | null
          fhir_id: string | null
          id: string
          location: string | null
          notes: string | null
          patient_mrn: string
          provider: string | null
          reason: string | null
          scheduled_for: string
          status: string
          updated_at: string
        }
        Insert: {
          appointment_type?: string | null
          created_at?: string
          description?: string | null
          fhir_id?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          patient_mrn: string
          provider?: string | null
          reason?: string | null
          scheduled_for: string
          status?: string
          updated_at?: string
        }
        Update: {
          appointment_type?: string | null
          created_at?: string
          description?: string | null
          fhir_id?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          patient_mrn?: string
          provider?: string | null
          reason?: string | null
          scheduled_for?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      care_plans: {
        Row: {
          activity_instructions: string | null
          created_at: string
          diet_instructions: string | null
          encounter_id: string
          fhir_id: string | null
          follow_up_details: string | null
          id: string
          patient_mrn: string | null
          return_precautions: string | null
          updated_at: string
        }
        Insert: {
          activity_instructions?: string | null
          created_at?: string
          diet_instructions?: string | null
          encounter_id: string
          fhir_id?: string | null
          follow_up_details?: string | null
          id?: string
          patient_mrn?: string | null
          return_precautions?: string | null
          updated_at?: string
        }
        Update: {
          activity_instructions?: string | null
          created_at?: string
          diet_instructions?: string | null
          encounter_id?: string
          fhir_id?: string | null
          follow_up_details?: string | null
          id?: string
          patient_mrn?: string | null
          return_precautions?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_plans_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_plans_patient_mrn_fkey"
            columns: ["patient_mrn"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["mrn"]
          },
        ]
      }
      care_team: {
        Row: {
          created_at: string
          fhir_id: string | null
          id: string
          member_key: string
          name: string
          organization: string | null
          patient_mrn: string
          role: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          fhir_id?: string | null
          id?: string
          member_key: string
          name: string
          organization?: string | null
          patient_mrn: string
          role?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          fhir_id?: string | null
          id?: string
          member_key?: string
          name?: string
          organization?: string | null
          patient_mrn?: string
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_team_patient_mrn_fkey"
            columns: ["patient_mrn"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["mrn"]
          },
        ]
      }
      clinical_history: {
        Row: {
          body_site: string | null
          category: string | null
          clinical_note: string | null
          clinical_status: string | null
          created_at: string
          description: string | null
          fhir_id: string | null
          id: string
          onset_date: string | null
          patient_mrn: string
          updated_at: string
        }
        Insert: {
          body_site?: string | null
          category?: string | null
          clinical_note?: string | null
          clinical_status?: string | null
          created_at?: string
          description?: string | null
          fhir_id?: string | null
          id?: string
          onset_date?: string | null
          patient_mrn: string
          updated_at?: string
        }
        Update: {
          body_site?: string | null
          category?: string | null
          clinical_note?: string | null
          clinical_status?: string | null
          created_at?: string
          description?: string | null
          fhir_id?: string | null
          id?: string
          onset_date?: string | null
          patient_mrn?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_history_patient_mrn_fkey"
            columns: ["patient_mrn"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["mrn"]
          },
        ]
      }
      encounters: {
        Row: {
          activity_instructions: string | null
          admitting_diagnosis: string | null
          chief_complaint: string | null
          created_at: string
          diet_instructions: string | null
          discharge_condition: string | null
          discharge_diagnosis: string | null
          encounter_date: string | null
          encounter_end_time: string | null
          facility: string | null
          fhir_id: string | null
          hospital_course: string | null
          hospital_course_narrative: string | null
          id: string
          patient_mrn: string
          return_precautions: string | null
          status: string | null
          type: string | null
          updated_at: string
        }
        Insert: {
          activity_instructions?: string | null
          admitting_diagnosis?: string | null
          chief_complaint?: string | null
          created_at?: string
          diet_instructions?: string | null
          discharge_condition?: string | null
          discharge_diagnosis?: string | null
          encounter_date?: string | null
          encounter_end_time?: string | null
          facility?: string | null
          fhir_id?: string | null
          hospital_course?: string | null
          hospital_course_narrative?: string | null
          id?: string
          patient_mrn: string
          return_precautions?: string | null
          status?: string | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          activity_instructions?: string | null
          admitting_diagnosis?: string | null
          chief_complaint?: string | null
          created_at?: string
          diet_instructions?: string | null
          discharge_condition?: string | null
          discharge_diagnosis?: string | null
          encounter_date?: string | null
          encounter_end_time?: string | null
          facility?: string | null
          fhir_id?: string | null
          hospital_course?: string | null
          hospital_course_narrative?: string | null
          id?: string
          patient_mrn?: string
          return_precautions?: string | null
          status?: string | null
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "encounters_patient_mrn_fkey"
            columns: ["patient_mrn"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["mrn"]
          },
        ]
      }
      family_member_history: {
        Row: {
          condition_name: string | null
          created_at: string
          fhir_id: string | null
          id: string
          notes: string | null
          patient_mrn: string
          relationship: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          condition_name?: string | null
          created_at?: string
          fhir_id?: string | null
          id?: string
          notes?: string | null
          patient_mrn: string
          relationship?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          condition_name?: string | null
          created_at?: string
          fhir_id?: string | null
          id?: string
          notes?: string | null
          patient_mrn?: string
          relationship?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_member_history_patient_mrn_fkey"
            columns: ["patient_mrn"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["mrn"]
          },
        ]
      }
      medications: {
        Row: {
          category: string | null
          created_at: string
          dosage: string | null
          encounter_id: string | null
          fhir_id: string | null
          id: string
          name: string | null
          patient_mrn: string
          prescribed_date: string | null
          prescriber: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          dosage?: string | null
          encounter_id?: string | null
          fhir_id?: string | null
          id?: string
          name?: string | null
          patient_mrn: string
          prescribed_date?: string | null
          prescriber?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          dosage?: string | null
          encounter_id?: string | null
          fhir_id?: string | null
          id?: string
          name?: string | null
          patient_mrn?: string
          prescribed_date?: string | null
          prescriber?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medications_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medications_patient_mrn_fkey"
            columns: ["patient_mrn"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["mrn"]
          },
        ]
      }
      observations: {
        Row: {
          category: string | null
          created_at: string
          effective_time: string | null
          encounter_id: string | null
          fhir_id: string | null
          id: string
          patient_mrn: string
          test_name: string | null
          unit: string | null
          updated_at: string
          value: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          effective_time?: string | null
          encounter_id?: string | null
          fhir_id?: string | null
          id?: string
          patient_mrn: string
          test_name?: string | null
          unit?: string | null
          updated_at?: string
          value?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          effective_time?: string | null
          encounter_id?: string | null
          fhir_id?: string | null
          id?: string
          patient_mrn?: string
          test_name?: string | null
          unit?: string | null
          updated_at?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "observations_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observations_patient_mrn_fkey"
            columns: ["patient_mrn"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["mrn"]
          },
        ]
      }
      patients: {
        Row: {
          address: string | null
          created_at: string
          dob: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          first_name: string | null
          gender: string | null
          id: string
          insurance_provider: string | null
          last_name: string | null
          mrn: string
          phone: string | null
          policy_number: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          dob?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          first_name?: string | null
          gender?: string | null
          id?: string
          insurance_provider?: string | null
          last_name?: string | null
          mrn: string
          phone?: string | null
          policy_number?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          dob?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          first_name?: string | null
          gender?: string | null
          id?: string
          insurance_provider?: string | null
          last_name?: string | null
          mrn?: string
          phone?: string | null
          policy_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      purge_stale_patient_data: { Args: never; Returns: undefined }
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
