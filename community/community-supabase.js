/* =========================================
   IXL KOREA COMMUNITY
   SHARED SUPABASE CLIENT
   ========================================= */

const SUPABASE_URL =
  'https://mrptiqntyimdbiafurem.supabase.co';

const SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_roa30OS691X5p391ta9FUQ_oBRd8RYF';

window.IXLCommunity =
  window.IXLCommunity || {};

window.IXLCommunity.supabase =
  window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );
