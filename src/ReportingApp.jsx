import { useState, useEffect } from 'react';
import './App.css';

const API_BASE_URL = 'http://localhost:4000'; // Updated backend URL

function App() {
  const [campaigns, setCampaigns] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  useEffect(() => {
    if (selectedWorkspace) {
      fetchCampaignStats();
    }
  }, [selectedWorkspace, statusFilter, dateRange]);

  const fetchWorkspaces = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/workspaces`);
      const data = await response.json();
      setWorkspaces(data);
      if (data.length > 0) {
        setSelectedWorkspace(data[0]._id);
      }
    } catch (err) {
      setError('Failed to fetch workspaces');
      setLoading(false);
    }
  };

  const fetchCampaignStats = async () => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams({
        workspaceId: selectedWorkspace,
        ...(statusFilter !== 'ALL' && { status: statusFilter }),
        startDate: dateRange.startDate,
        endDate: dateRange.endDate
      });

      const response = await fetch(`${API_BASE_URL}/api/campaign-stats?${queryParams}`);
      const data = await response.json();
      
      // Sort the data before setting it to state
      const sortedData = sortCampaigns(data);
      setCampaigns(sortedData);
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch campaign statistics');
      setLoading(false);
    }
  };

  const getFilteredStats = () => {
    return {
      totalContacted: campaigns.reduce((sum, camp) => sum + camp.lead_contacted_count, 0),
      totalReplies: campaigns.reduce((sum, camp) => sum + camp.replied_count, 0),
      positiveReplies: campaigns.reduce((sum, camp) => sum + camp.positive_reply_count, 0),
      activeCampaigns: campaigns.filter(camp => camp.status === 'ACTIVE').length
    };
  };

  const sortCampaigns = (data) => {
    return [...data].sort((a, b) => {
      let compareA = a[sortBy];
      let compareB = b[sortBy];

      // Handle date comparison
      if (sortBy === 'created_at') {
        compareA = new Date(compareA).getTime();
        compareB = new Date(compareB).getTime();
      } 
      // Handle numeric comparison
      else if (typeof compareA === 'number' && typeof compareB === 'number') {
        // Keep as is, will be compared as numbers
      }
      // Handle string comparison
      else if (typeof compareA === 'string' && typeof compareB === 'string') {
        compareA = compareA.toLowerCase();
        compareB = compareB.toLowerCase();
      }

      // Handle null/undefined values
      if (compareA === null || compareA === undefined) return 1;
      if (compareB === null || compareB === undefined) return -1;

      if (sortOrder === 'asc') {
        return compareA > compareB ? 1 : compareA < compareB ? -1 : 0;
      } else {
        return compareA < compareB ? 1 : compareA > compareB ? -1 : 0;
      }
    });
  };

  const handleSort = (field) => {
    if (field === sortBy) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    // Re-sort the current campaigns array
    setCampaigns(prev => sortCampaigns([...prev]));
  };

  if (loading && !campaigns.length) return <div className="loading">Loading...</div>;
  if (error) return <div className="error">{error}</div>;

  const stats = getFilteredStats();

  return (
    <div className="app">
      <header className="header">
        <h1>Campaign Statistics</h1>
        
        <div className="filters">
          <div className="filter-group">
            <label>Workspace:</label>
            <select 
              value={selectedWorkspace} 
              onChange={(e) => setSelectedWorkspace(e.target.value)}
            >
              {workspaces.map(workspace => (
                <option key={workspace._id} value={workspace._id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Status:</label>
            <select 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All</option>
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
              <option value="PAUSED">Paused</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Date Range:</label>
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
            />
            <span>to</span>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
            />
          </div>
        </div>
      </header>
      
      <main className="main">
        <div className="stats-summary">
          <div className="summary-card">
            <h3>Total Contacted in Date Range</h3>
            <span>{stats.totalContacted}</span>
          </div>
          <div className="summary-card">
            <h3>Total Replies in Date Range</h3>
            <span>{stats.totalReplies}</span>
          </div>
          <div className="summary-card">
            <h3>Positive Replies in Date Range</h3>
            <span>{stats.positiveReplies}</span>
          </div>
          <div className="summary-card">
            <h3>Active Campaigns in Date Range</h3>
            <span>{stats.activeCampaigns}</span>
          </div>
        </div>

        <div className="table-container">
          <table className="campaigns-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('camp_name')} className="sortable">
                  Campaign Name {sortBy === 'camp_name' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th>Status</th>
                <th onClick={() => handleSort('lead_count')} className="sortable">
                  Leads {sortBy === 'lead_count' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('completed_lead_count')} className="sortable">
                  Completed {sortBy === 'completed_lead_count' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('lead_contacted_count')} className="sortable">
                  Contacted {sortBy === 'lead_contacted_count' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('sent_email_count')} className="sortable">
                  Sent Emails {sortBy === 'sent_email_count' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('replied_count')} className="sortable">
                  Replies {sortBy === 'replied_count' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('positive_reply_count')} className="sortable">
                  Positive {sortBy === 'positive_reply_count' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('bounced_count')} className="sortable">
                  Bounced {sortBy === 'bounced_count' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('unsubscribed_count')} className="sortable">
                  Unsubscribed {sortBy === 'unsubscribed_count' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('created_at')} className="sortable">
                  Created At {sortBy === 'created_at' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map(campaign => (
                <tr key={campaign._id}>
                  <td>{campaign.camp_name}</td>
                  <td>
                    <span className="status-badge" data-status={campaign.status}>
                      {campaign.status}
                    </span>
                  </td>
                  <td>{campaign.lead_count}</td>
                  <td>{campaign.completed_lead_count}</td>
                  <td>{campaign.lead_contacted_count}</td>
                  <td>{campaign.sent_email_count}</td>
                  <td>{campaign.replied_count}</td>
                  <td>{campaign.positive_reply_count}</td>
                  <td>{campaign.bounced_count}</td>
                  <td>{campaign.unsubscribed_count}</td>
                  <td>{new Date(campaign.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

export default App;
