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
      contacts: {
        Row: {
          address: string | null
          created_at: string
          credit_limit: number | null
          email: string | null
          gstin: string | null
          id: string
          name: string
          notes: string | null
          opening_balance: number | null
          phone: string | null
          state: string | null
          type: Database["public"]["Enums"]["contact_type"]
          user_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          credit_limit?: number | null
          email?: string | null
          gstin?: string | null
          id?: string
          name: string
          notes?: string | null
          opening_balance?: number | null
          phone?: string | null
          state?: string | null
          type?: Database["public"]["Enums"]["contact_type"]
          user_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          credit_limit?: number | null
          email?: string | null
          gstin?: string | null
          id?: string
          name?: string
          notes?: string | null
          opening_balance?: number | null
          phone?: string | null
          state?: string | null
          type?: Database["public"]["Enums"]["contact_type"]
          user_id?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          date: string
          id: string
          mode: string | null
          notes: string | null
          user_id: string
        }
        Insert: {
          amount?: number
          category?: string
          created_at?: string
          date?: string
          id?: string
          mode?: string | null
          notes?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          date?: string
          id?: string
          mode?: string | null
          notes?: string | null
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          contact_id: string | null
          contact_name: string | null
          created_at: string
          date: string
          direction: string
          id: string
          mode: string | null
          notes: string | null
          payment_no: string
          ref_doc: string | null
          user_id: string
        }
        Insert: {
          amount?: number
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string
          date?: string
          direction: string
          id?: string
          mode?: string | null
          notes?: string | null
          payment_no: string
          ref_doc?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string
          date?: string
          direction?: string
          id?: string
          mode?: string | null
          notes?: string | null
          payment_no?: string
          ref_doc?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          code: string
          created_at: string
          hsn: string | null
          id: string
          name: string
          notes: string | null
          opening_stock: number | null
          purchase_rate: number | null
          reorder_level: number | null
          sale_rate: number | null
          unit: string | null
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          hsn?: string | null
          id?: string
          name: string
          notes?: string | null
          opening_stock?: number | null
          purchase_rate?: number | null
          reorder_level?: number | null
          sale_rate?: number | null
          unit?: string | null
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          hsn?: string | null
          id?: string
          name?: string
          notes?: string | null
          opening_stock?: number | null
          purchase_rate?: number | null
          reorder_level?: number | null
          sale_rate?: number | null
          unit?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      purchase_items: {
        Row: {
          gst_pct: number | null
          id: string
          length: number | null
          position: number | null
          product_id: string | null
          product_name: string | null
          purchase_id: string
          qty: number
          rate: number
          unit: string | null
          width: number | null
        }
        Insert: {
          gst_pct?: number | null
          id?: string
          length?: number | null
          position?: number | null
          product_id?: string | null
          product_name?: string | null
          purchase_id: string
          qty?: number
          rate?: number
          unit?: string | null
          width?: number | null
        }
        Update: {
          gst_pct?: number | null
          id?: string
          length?: number | null
          position?: number | null
          product_id?: string | null
          product_name?: string | null
          purchase_id?: string
          qty?: number
          rate?: number
          unit?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "stock_view"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          created_at: string
          date: string
          id: string
          notes: string | null
          po_no: string
          status: string | null
          supplier_id: string | null
          supplier_name: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          po_no: string
          status?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          po_no?: string
          status?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_items: {
        Row: {
          gst_pct: number | null
          id: string
          length: number | null
          position: number | null
          product_id: string | null
          product_name: string | null
          qty: number
          quotation_id: string
          rate: number
          unit: string | null
          width: number | null
        }
        Insert: {
          gst_pct?: number | null
          id?: string
          length?: number | null
          position?: number | null
          product_id?: string | null
          product_name?: string | null
          qty?: number
          quotation_id: string
          rate?: number
          unit?: string | null
          width?: number | null
        }
        Update: {
          gst_pct?: number | null
          id?: string
          length?: number | null
          position?: number | null
          product_id?: string | null
          product_name?: string | null
          qty?: number
          quotation_id?: string
          rate?: number
          unit?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quotation_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "stock_view"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "quotation_items_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          buyer_id: string | null
          buyer_name: string | null
          created_at: string
          date: string
          id: string
          notes: string | null
          quote_no: string
          user_id: string
          valid_until: string | null
        }
        Insert: {
          buyer_id?: string | null
          buyer_name?: string | null
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          quote_no: string
          user_id: string
          valid_until?: string | null
        }
        Update: {
          buyer_id?: string | null
          buyer_name?: string | null
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          quote_no?: string
          user_id?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotations_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          gst_pct: number | null
          id: string
          length: number | null
          position: number | null
          product_id: string | null
          product_name: string | null
          qty: number
          rate: number
          sale_id: string
          unit: string | null
          width: number | null
        }
        Insert: {
          gst_pct?: number | null
          id?: string
          length?: number | null
          position?: number | null
          product_id?: string | null
          product_name?: string | null
          qty?: number
          rate?: number
          sale_id: string
          unit?: string | null
          width?: number | null
        }
        Update: {
          gst_pct?: number | null
          id?: string
          length?: number | null
          position?: number | null
          product_id?: string | null
          product_name?: string | null
          qty?: number
          rate?: number
          sale_id?: string
          unit?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "stock_view"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          buyer_id: string | null
          buyer_name: string | null
          created_at: string
          date: string
          id: string
          invoice_no: string
          notes: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          buyer_id?: string | null
          buyer_name?: string | null
          created_at?: string
          date?: string
          id?: string
          invoice_no: string
          notes?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          buyer_id?: string | null
          buyer_name?: string | null
          created_at?: string
          date?: string
          id?: string
          invoice_no?: string
          notes?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          address: string | null
          company_name: string
          currency: string | null
          email: string | null
          fy_start: string | null
          gstin: string | null
          low_stock_threshold: number | null
          phone: string | null
          state: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          company_name?: string
          currency?: string | null
          email?: string | null
          fy_start?: string | null
          gstin?: string | null
          low_stock_threshold?: number | null
          phone?: string | null
          state?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          company_name?: string
          currency?: string | null
          email?: string | null
          fy_start?: string | null
          gstin?: string | null
          low_stock_threshold?: number | null
          phone?: string | null
          state?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      third_party: {
        Row: {
          buyer_id: string | null
          buyer_name: string | null
          created_at: string
          date: string
          id: string
          notes: string | null
          supplier_id: string | null
          supplier_name: string | null
          tp_no: string
          user_id: string
        }
        Insert: {
          buyer_id?: string | null
          buyer_name?: string | null
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          tp_no: string
          user_id: string
        }
        Update: {
          buyer_id?: string | null
          buyer_name?: string | null
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          tp_no?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "third_party_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "third_party_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      tp_items: {
        Row: {
          gst_pct: number | null
          id: string
          length: number | null
          position: number | null
          product_id: string | null
          product_name: string | null
          purchase_rate: number
          qty: number
          sale_rate: number
          tp_id: string
          unit: string | null
          width: number | null
        }
        Insert: {
          gst_pct?: number | null
          id?: string
          length?: number | null
          position?: number | null
          product_id?: string | null
          product_name?: string | null
          purchase_rate?: number
          qty?: number
          sale_rate?: number
          tp_id: string
          unit?: string | null
          width?: number | null
        }
        Update: {
          gst_pct?: number | null
          id?: string
          length?: number | null
          position?: number | null
          product_id?: string | null
          product_name?: string | null
          purchase_rate?: number
          qty?: number
          sale_rate?: number
          tp_id?: string
          unit?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tp_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tp_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "stock_view"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "tp_items_tp_id_fkey"
            columns: ["tp_id"]
            isOneToOne: false
            referencedRelation: "third_party"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      ledger_view: {
        Row: {
          account: string | null
          credit: number | null
          date: string | null
          debit: number | null
          narration: string | null
          party: string | null
          source_id: string | null
          source_type: string | null
          user_id: string | null
        }
        Relationships: []
      }
      stock_view: {
        Row: {
          code: string | null
          name: string | null
          on_hand: number | null
          opening_stock: number | null
          product_id: string | null
          purchased: number | null
          reorder_level: number | null
          sold: number | null
          unit: string | null
          user_id: string | null
        }
        Insert: {
          code?: string | null
          name?: string | null
          on_hand?: never
          opening_stock?: number | null
          product_id?: string | null
          purchased?: never
          reorder_level?: number | null
          sold?: never
          unit?: string | null
          user_id?: string | null
        }
        Update: {
          code?: string | null
          name?: string | null
          on_hand?: never
          opening_stock?: number | null
          product_id?: string | null
          purchased?: never
          reorder_level?: number | null
          sold?: never
          unit?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      next_doc_no: {
        Args: { _col: string; _prefix: string; _table: string; _user: string }
        Returns: string
      }
    }
    Enums: {
      contact_type: "buyer" | "supplier" | "both"
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
    Enums: {
      contact_type: ["buyer", "supplier", "both"],
    },
  },
} as const
