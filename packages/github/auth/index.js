exports.main = async function main(args) {
  var corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (args.__ow_method === 'options') {
    return { statusCode: 204, headers: corsHeaders };
  }

  if (args.__ow_method !== 'post') {
    return { statusCode: 405, headers: corsHeaders, body: { error: 'Method not allowed' } };
  }

  var code = args.code;
  if (!code || typeof code !== 'string') {
    return { statusCode: 400, headers: corsHeaders, body: { error: 'Missing code parameter' } };
  }

  var clientId = process.env.GITHUB_CLIENT_ID;
  var clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { statusCode: 500, headers: corsHeaders, body: { error: 'GitHub OAuth not configured' } };
  }

  try {
    var res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code: code })
    });

    var data = await res.json();

    if (data.error) {
      return { statusCode: 401, headers: corsHeaders, body: { error: data.error_description || data.error } };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: { access_token: data.access_token, token_type: data.token_type, scope: data.scope }
    };
  } catch (err) {
    return { statusCode: 502, headers: corsHeaders, body: { error: 'Failed to contact GitHub: ' + err.message } };
  }
};
