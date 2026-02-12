import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { appendToSheet } from '../_shared/sheets.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SPREADSHEET_ID = '1xU7-FSZ1keYUAhEpt-2RRXWzLwjzvUUbesS4SJRI_3o';
const SHEET_NAME = 'Ritten';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch ALL existing trips from DB
    const { data: readings, error } = await supabase
      .from('mileage_readings')
      .select(`
        *,
        vehicle:vehicles(display_name, license_plate, vin)
      `)
      .order('reading_date', { ascending: true });

    if (error) throw error;

    console.log(`Found ${readings.length} readings to backfill.`);

    const rows = [];
    
    for (const reading of readings) {
      // Calculate start/end based on metadata if available, otherwise guess
      const endOdo = reading.odometer_km;
      const startOdo = reading.odometer_km - (reading.daily_km || 0);
      const diff = reading.daily_km || 0;
      
      // Skip 0km entries unless requested
      if (diff === 0) continue; 

      const row = [
        reading.reading_date, // Datum
        new Date(reading.created_at).toLocaleTimeString('nl-NL', {hour: '2-digit', minute:'2-digit'}), // Tijd
        reading.vehicle?.license_plate || reading.vehicle?.vin || 'Unknown', // Kenteken
        startOdo, // Start
        endOdo, // End
        diff, // Verschil
        reading.location_name || 'Onbekend', // Locatie
        "Zakelijk (Backfill)" // Type
      ];
      rows.push(row);
    }

    if (rows.length > 0) {
      // Append in batches? For now just one big append.
      // Google Sheets API append can handle multiple rows if passed as values
      // But our helper might be single row. Let's check.
      // appendToSheet takes 'values' which is any[][].
      
      // We need to call appendToSheet for EACH row or modify helper to support batch.
      // The helper usually takes a single row (1D array) or 2D array.
      // Let's assume 2D array support or loop.
      
      // Checking helper... standard google sheets append valueInputOption is RAW/USER_ENTERED
      // and values is [][]
      
      await appendToSheet(SPREADSHEET_ID, `${SHEET_NAME}!A:H`, rows); // Sending 2D array
      console.log(`Backfilled ${rows.length} rows to sheet.`);
    }

    return new Response(JSON.stringify({ success: true, count: rows.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
