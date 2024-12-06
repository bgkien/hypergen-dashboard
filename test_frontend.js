import axios from 'axios';

const BASE_URL = 'http://localhost:6173';
const API_BASE_URL = 'https://pipl-ai-dashboard-f2a0f689cbf5.herokuapp.com';

async function testFrontend() {
    try {
        console.log('🔍 Testing frontend integration...');

        // Test 1: Verify frontend is running
        const frontendResponse = await axios.get(BASE_URL);
        console.log('✅ Frontend is running');

        // Test 2: Test workspace loading
        const workspaceResponse = await axios.get(`${API_BASE_URL}/api/workspaces`);
        console.log(`✅ Loaded ${workspaceResponse.data.length} workspaces`);
        
        // Get a valid workspace ID
        const workspaceId = workspaceResponse.data[0]._id;
        
        // Test 3: Test campaign stats with valid workspace
        const campaignResponse = await axios.get(`${API_BASE_URL}/api/campaign-stats`, {
            params: {
                workspaceId,
                start_date: '2024-11-29',
                end_date: '2024-12-06'
            }
        });
        console.log(`✅ Loaded ${campaignResponse.data.length} campaigns for workspace ${workspaceId}`);
        
        // Test 4: Verify campaign data structure
        const sampleCampaign = campaignResponse.data[0];
        console.log('\nSample campaign data structure:');
        console.log(JSON.stringify({
            id: sampleCampaign._id,
            name: sampleCampaign.camp_name,
            status: sampleCampaign.status,
            metrics: {
                lead_count: sampleCampaign.lead_count,
                completed_lead_count: sampleCampaign.completed_lead_count,
                lead_contacted_count: sampleCampaign.lead_contacted_count,
                sent_count: sampleCampaign.sent_count,
                replied_count: sampleCampaign.replied_count,
                positive_reply_count: sampleCampaign.positive_reply_count
            }
        }, null, 2));

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.response) {
            console.error('Error response:', {
                status: error.response.status,
                data: error.response.data
            });
        }
    }
}

testFrontend();
