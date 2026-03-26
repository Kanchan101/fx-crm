const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

let supabase = null;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log('[Storage] Supabase Storage connected');
} else {
  console.warn('[Storage] SUPABASE_URL or SUPABASE_SERVICE_KEY not set — CV storage disabled');
}

// Upload CV file to Supabase Storage
async function uploadCV(fileBuffer, fileName, candidateName) {
  if (!supabase) {
    console.warn('[Storage] Skipping upload — Supabase not configured');
    return null;
  }

  // Clean filename: CandidateName_OriginalName.ext
  const cleanName = candidateName
    ? candidateName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30)
    : 'candidate';
  const timestamp = Date.now();
  const ext = fileName.split('.').pop().toLowerCase();
  const storagePath = `${cleanName}_${timestamp}.${ext}`;

  const { data, error } = await supabase.storage
    .from('cvs')
    .upload(storagePath, fileBuffer, {
      contentType: ext === 'pdf' ? 'application/pdf' :
        ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
        'application/octet-stream',
      upsert: false,
    });

  if (error) {
    console.error('[Storage] Upload error:', error.message);
    return null;
  }

  console.log('[Storage] CV uploaded:', storagePath);
  return storagePath;
}

// Download CV from Supabase Storage — returns { buffer, fileName, contentType }
async function downloadCV(storagePath) {
  if (!supabase || !storagePath) return null;

  const { data, error } = await supabase.storage
    .from('cvs')
    .download(storagePath);

  if (error) {
    console.error('[Storage] Download error:', error.message);
    return null;
  }

  const arrayBuffer = await data.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const ext = storagePath.split('.').pop().toLowerCase();

  return {
    buffer,
    fileName: storagePath,
    contentType: ext === 'pdf' ? 'application/pdf' :
      ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
      'application/octet-stream',
  };
}

// Get public URL (if bucket is public)
function getPublicUrl(storagePath) {
  if (!supabase || !storagePath) return null;
  const { data } = supabase.storage.from('cvs').getPublicUrl(storagePath);
  return data?.publicUrl || null;
}

module.exports = { uploadCV, downloadCV, getPublicUrl };
