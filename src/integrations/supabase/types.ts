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
      audit_log: {
        Row: {
          action: string
          at: string
          diff: Json | null
          entity: string
          entity_id: string | null
          id: string
          ref_no: string | null
          summary: string | null
          user_id: string
        }
        Insert: {
          action: string
          at?: string
          diff?: Json | null
          entity: string
          entity_id?: string | null
          id?: string
          ref_no?: string | null
          summary?: string | null
          user_id: string
        }
        Update: {
          action?: string
          at?: string
          diff?: Json | null
          entity?: string
          entity_id?: string | null
          id?: string
          ref_no?: string | null
          summary?: string | null
          user_id?: string
        }
        Relationships: []
      }
      bank_transfers: {
        Row: {
          amount: number
          bank_name: string | null
          cheque_date: string | null
          cheque_no: string | null
          cleared: boolean
          cleared_at: string | null
          created_at: string
          date: string
          id: string
          kind: string
          notes: string | null
          transfer_no: string | null
          txn_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          bank_name?: string | null
          cheque_date?: string | null
          cheque_no?: string | null
          cleared?: boolean
          cleared_at?: string | null
          created_at?: string
          date?: string
          id?: string
          kind: string
          notes?: string | null
          transfer_no?: string | null
          txn_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          bank_name?: string | null
          cheque_date?: string | null
          cheque_no?: string | null
          cleared?: boolean
          cleared_at?: string | null
          created_at?: string
          date?: string
          id?: string
          kind?: string
          notes?: string | null
          transfer_no?: string | null
          txn_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          address: string | null
          code: string | null
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
          code?: string | null
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
          code?: string | null
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
      deliveries: {
        Row: {
          buyer_id: string | null
          buyer_name: string | null
          created_at: string
          date: string
          delivered_at: string | null
          delivery_no: string
          dispatched_at: string | null
          driver_name: string | null
          driver_phone: string | null
          id: string
          invoice_no: string | null
          lr_no: string | null
          notes: string | null
          sale_id: string | null
          ship_address: string | null
          status: string
          tp_id: string | null
          transporter: string | null
          user_id: string
          vehicle_no: string | null
        }
        Insert: {
          buyer_id?: string | null
          buyer_name?: string | null
          created_at?: string
          date?: string
          delivered_at?: string | null
          delivery_no: string
          dispatched_at?: string | null
          driver_name?: string | null
          driver_phone?: string | null
          id?: string
          invoice_no?: string | null
          lr_no?: string | null
          notes?: string | null
          sale_id?: string | null
          ship_address?: string | null
          status?: string
          tp_id?: string | null
          transporter?: string | null
          user_id: string
          vehicle_no?: string | null
        }
        Update: {
          buyer_id?: string | null
          buyer_name?: string | null
          created_at?: string
          date?: string
          delivered_at?: string | null
          delivery_no?: string
          dispatched_at?: string | null
          driver_name?: string | null
          driver_phone?: string | null
          id?: string
          invoice_no?: string | null
          lr_no?: string | null
          notes?: string | null
          sale_id?: string | null
          ship_address?: string | null
          status?: string
          tp_id?: string | null
          transporter?: string | null
          user_id?: string
          vehicle_no?: string | null
        }
        Relationships: []
      }
      delivery_items: {
        Row: {
          delivery_id: string
          id: string
          position: number | null
          product_id: string | null
          product_name: string | null
          qty_delivered: number
          qty_ordered: number
          unit: string | null
        }
        Insert: {
          delivery_id: string
          id?: string
          position?: number | null
          product_id?: string | null
          product_name?: string | null
          qty_delivered?: number
          qty_ordered?: number
          unit?: string | null
        }
        Update: {
          delivery_id?: string
          id?: string
          position?: number | null
          product_id?: string | null
          product_name?: string | null
          qty_delivered?: number
          qty_ordered?: number
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_items_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
        ]
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
      fixed_assets: {
        Row: {
          accumulated_depreciation: number
          asset_no: string
          category: string
          cost: number
          created_at: string
          depreciation_method: string
          disposal_value: number | null
          disposed_at: string | null
          id: string
          name: string
          notes: string | null
          paid_via: string
          purchase_date: string
          salvage_value: number
          supplier_id: string | null
          supplier_name: string | null
          useful_life_years: number
          user_id: string
          wdv_rate_pct: number
        }
        Insert: {
          accumulated_depreciation?: number
          asset_no: string
          category?: string
          cost?: number
          created_at?: string
          depreciation_method?: string
          disposal_value?: number | null
          disposed_at?: string | null
          id?: string
          name: string
          notes?: string | null
          paid_via?: string
          purchase_date?: string
          salvage_value?: number
          supplier_id?: string | null
          supplier_name?: string | null
          useful_life_years?: number
          user_id: string
          wdv_rate_pct?: number
        }
        Update: {
          accumulated_depreciation?: number
          asset_no?: string
          category?: string
          cost?: number
          created_at?: string
          depreciation_method?: string
          disposal_value?: number | null
          disposed_at?: string | null
          id?: string
          name?: string
          notes?: string | null
          paid_via?: string
          purchase_date?: string
          salvage_value?: number
          supplier_id?: string | null
          supplier_name?: string | null
          useful_life_years?: number
          user_id?: string
          wdv_rate_pct?: number
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          created_at: string
          date: string
          id: string
          narration: string | null
          source_id: string
          source_kind: string
          source_no: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          narration?: string | null
          source_id: string
          source_kind: string
          source_no?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          narration?: string | null
          source_id?: string
          source_kind?: string
          source_no?: string | null
          user_id?: string
        }
        Relationships: []
      }
      journal_lines: {
        Row: {
          account: string
          credit: number
          date: string
          debit: number
          entry_id: string
          id: string
          narration: string | null
          party: string | null
          ref_no: string | null
          user_id: string
        }
        Insert: {
          account: string
          credit?: number
          date: string
          debit?: number
          entry_id: string
          id?: string
          narration?: string | null
          party?: string | null
          ref_no?: string | null
          user_id: string
        }
        Update: {
          account?: string
          credit?: number
          date?: string
          debit?: number
          entry_id?: string
          id?: string
          narration?: string | null
          party?: string | null
          ref_no?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          at: string
          body: string | null
          id: string
          kind: string
          link: string | null
          read: boolean
          severity: string
          title: string
          user_id: string
        }
        Insert: {
          at?: string
          body?: string | null
          id?: string
          kind: string
          link?: string | null
          read?: boolean
          severity?: string
          title: string
          user_id: string
        }
        Update: {
          at?: string
          body?: string | null
          id?: string
          kind?: string
          link?: string | null
          read?: boolean
          severity?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_allocations: {
        Row: {
          amount: number
          created_at: string
          doc_id: string
          doc_kind: string
          doc_no: string | null
          id: string
          payment_id: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          doc_id: string
          doc_kind: string
          doc_no?: string | null
          id?: string
          payment_id: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          doc_id?: string
          doc_kind?: string
          doc_no?: string | null
          id?: string
          payment_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          bank_name: string | null
          cheque_date: string | null
          cheque_no: string | null
          cleared: boolean
          cleared_at: string | null
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
          txn_id: string | null
          user_id: string
        }
        Insert: {
          amount?: number
          bank_name?: string | null
          cheque_date?: string | null
          cheque_no?: string | null
          cleared?: boolean
          cleared_at?: string | null
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
          txn_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          bank_name?: string | null
          cheque_date?: string | null
          cheque_no?: string | null
          cleared?: boolean
          cleared_at?: string | null
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
          txn_id?: string | null
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
          {
            foreignKeyName: "payments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "party_summary_view"
            referencedColumns: ["contact_id"]
          },
        ]
      }
      price_list_items: {
        Row: {
          category: string | null
          cost_rate: number
          discount_pct: number
          gst_pct: number
          hsn: string | null
          id: string
          list_rate: number
          margin_pct: number
          min_qty: number
          mrp: number
          position: number
          price_list_id: string
          product_code: string | null
          product_id: string | null
          product_name: string
          unit: string | null
        }
        Insert: {
          category?: string | null
          cost_rate?: number
          discount_pct?: number
          gst_pct?: number
          hsn?: string | null
          id?: string
          list_rate?: number
          margin_pct?: number
          min_qty?: number
          mrp?: number
          position?: number
          price_list_id: string
          product_code?: string | null
          product_id?: string | null
          product_name: string
          unit?: string | null
        }
        Update: {
          category?: string | null
          cost_rate?: number
          discount_pct?: number
          gst_pct?: number
          hsn?: string | null
          id?: string
          list_rate?: number
          margin_pct?: number
          min_qty?: number
          mrp?: number
          position?: number
          price_list_id?: string
          product_code?: string | null
          product_id?: string | null
          product_name?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_list_items_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      price_lists: {
        Row: {
          buyer_address: string | null
          buyer_id: string | null
          buyer_name: string | null
          buyer_phone: string | null
          category: string | null
          created_at: string
          currency: string
          effective_from: string
          id: string
          name: string
          notes: string | null
          terms: string | null
          user_id: string
          valid_until: string | null
        }
        Insert: {
          buyer_address?: string | null
          buyer_id?: string | null
          buyer_name?: string | null
          buyer_phone?: string | null
          category?: string | null
          created_at?: string
          currency?: string
          effective_from?: string
          id?: string
          name: string
          notes?: string | null
          terms?: string | null
          user_id: string
          valid_until?: string | null
        }
        Update: {
          buyer_address?: string | null
          buyer_id?: string | null
          buyer_name?: string | null
          buyer_phone?: string | null
          category?: string | null
          created_at?: string
          currency?: string
          effective_from?: string
          id?: string
          name?: string
          notes?: string | null
          terms?: string | null
          user_id?: string
          valid_until?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          category: string | null
          code: string
          created_at: string
          hsn: string | null
          id: string
          kind: string
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
          category?: string | null
          code: string
          created_at?: string
          hsn?: string | null
          id?: string
          kind?: string
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
          category?: string | null
          code?: string
          created_at?: string
          hsn?: string | null
          id?: string
          kind?: string
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
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "party_summary_view"
            referencedColumns: ["contact_id"]
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
          {
            foreignKeyName: "quotations_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "party_summary_view"
            referencedColumns: ["contact_id"]
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
          {
            foreignKeyName: "sales_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "party_summary_view"
            referencedColumns: ["contact_id"]
          },
        ]
      }
      settings: {
        Row: {
          address: string | null
          cogs_method: string
          company_name: string
          currency: string | null
          depreciation_auto: boolean
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
          cogs_method?: string
          company_name?: string
          currency?: string | null
          depreciation_auto?: boolean
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
          cogs_method?: string
          company_name?: string
          currency?: string | null
          depreciation_auto?: boolean
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
            foreignKeyName: "third_party_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "party_summary_view"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "third_party_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "third_party_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "party_summary_view"
            referencedColumns: ["contact_id"]
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
      cash_flow_view: {
        Row: {
          account: string | null
          inflow: number | null
          month: string | null
          net: number | null
          outflow: number | null
          user_id: string | null
        }
        Relationships: []
      }
      gst_summary_view: {
        Row: {
          input_cgst: number | null
          input_igst: number | null
          input_sgst: number | null
          input_total_legacy: number | null
          month: string | null
          output_cgst: number | null
          output_igst: number | null
          output_sgst: number | null
          output_total_legacy: number | null
          user_id: string | null
        }
        Relationships: []
      }
      ledger_view: {
        Row: {
          account: string | null
          credit: number | null
          date: string | null
          debit: number | null
          narration: string | null
          net: number | null
          party: string | null
          ref_no: string | null
          user_id: string | null
        }
        Insert: {
          account?: string | null
          credit?: number | null
          date?: string | null
          debit?: number | null
          narration?: string | null
          net?: never
          party?: string | null
          ref_no?: string | null
          user_id?: string | null
        }
        Update: {
          account?: string | null
          credit?: number | null
          date?: string | null
          debit?: number | null
          narration?: string | null
          net?: never
          party?: string | null
          ref_no?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      monthly_party_view: {
        Row: {
          amount: number | null
          docs: number | null
          month: string | null
          party_id: string | null
          party_name: string | null
          role: string | null
          user_id: string | null
        }
        Relationships: []
      }
      monthly_pnl_view: {
        Row: {
          cogs: number | null
          expenses: number | null
          month: string | null
          revenue: number | null
          user_id: string | null
        }
        Relationships: []
      }
      monthly_product_view: {
        Row: {
          month: string | null
          product_id: string | null
          product_name: string | null
          qty_sold: number | null
          revenue: number | null
          user_id: string | null
        }
        Relationships: []
      }
      outstanding_view: {
        Row: {
          balance: number | null
          date: string | null
          doc_id: string | null
          doc_kind: string | null
          doc_no: string | null
          paid: number | null
          party_id: string | null
          party_name: string | null
          status: string | null
          total: number | null
          user_id: string | null
        }
        Relationships: []
      }
      party_aging_view: {
        Row: {
          b_0_30: number | null
          b_31_60: number | null
          b_61_90: number | null
          b_90p: number | null
          last_doc_date: string | null
          open_docs: number | null
          party_id: string | null
          party_name: string | null
          side: string | null
          total_balance: number | null
          user_id: string | null
        }
        Relationships: []
      }
      party_summary_view: {
        Row: {
          code: string | null
          contact_id: string | null
          last_txn: string | null
          name: string | null
          payable: number | null
          receivable: number | null
          total_purchases: number | null
          total_sales: number | null
          type: Database["public"]["Enums"]["contact_type"] | null
          user_id: string | null
        }
        Insert: {
          code?: string | null
          contact_id?: string | null
          last_txn?: never
          name?: string | null
          payable?: never
          receivable?: never
          total_purchases?: never
          total_sales?: never
          type?: Database["public"]["Enums"]["contact_type"] | null
          user_id?: string | null
        }
        Update: {
          code?: string | null
          contact_id?: string | null
          last_txn?: never
          name?: string | null
          payable?: never
          receivable?: never
          total_purchases?: never
          total_sales?: never
          type?: Database["public"]["Enums"]["contact_type"] | null
          user_id?: string | null
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
      working_capital_view: {
        Row: {
          accumulated_depreciation: number | null
          bank: number | null
          cash: number | null
          gross_fixed_assets: number | null
          gst_input: number | null
          gst_output: number | null
          payable: number | null
          receivable: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _co_state: { Args: { _user: string }; Returns: string }
      _next_code: {
        Args: { _col: string; _prefix: string; _table: string; _user: string }
        Returns: string
      }
      _refresh_payment_narration: { Args: { _pid: string }; Returns: undefined }
      auto_allocate_payment: { Args: { _pid: string }; Returns: undefined }
      book_depreciation: { Args: { _period_end: string }; Returns: number }
      clear_my_deliveries: { Args: never; Returns: undefined }
      clear_my_notifications: { Args: never; Returns: undefined }
      next_doc_no: {
        Args: { _col: string; _prefix: string; _table: string; _user: string }
        Returns: string
      }
      notify: {
        Args: {
          _body: string
          _kind: string
          _link: string
          _severity: string
          _title: string
          _user: string
        }
        Returns: undefined
      }
      post_journal_bank_transfer: { Args: { _id: string }; Returns: undefined }
      post_journal_expense: { Args: { _id: string }; Returns: undefined }
      post_journal_fixed_asset: { Args: { _id: string }; Returns: undefined }
      post_journal_payment: { Args: { _id: string }; Returns: undefined }
      post_journal_purchase: { Args: { _id: string }; Returns: undefined }
      post_journal_sale: { Args: { _id: string }; Returns: undefined }
      post_journal_tp: { Args: { _id: string }; Returns: undefined }
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
