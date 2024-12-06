import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import './App.css';

// Use environment variable for API base URL
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const APP_DOMAIN = import.meta.env.VITE_APP_DOMAIN;

// Memoized table row component
const TableRow = React.memo(({ campaign }) => (
  <tr>
    <td>{campaign.camp_name}</td>
    <td>
      <span className="status-badge" data-status={campaign.status}>
        {campaign.status}
      </span>
    </td>
    <td>{(campaign.lead_contacted_count || 0).toLocaleString()}</td>
    <td>{(campaign.completed_lead_count || 0).toLocaleString()}</td>
    <td>{(campaign.lead_count || 0).toLocaleString()}</td>
    <td>{(campaign.sent_count || 0).toLocaleString()}</td>
    <td>{(campaign.replied_count || 0).toLocaleString()}</td>
    <td>{(campaign.positive_reply_count || 0).toLocaleString()}</td>
    <td>{(campaign.bounced_count || 0).toLocaleString()}</td>
    <td>{(campaign.unsubscribed_count || 0).toLocaleString()}</td>
    <td>{new Date(campaign.created_at).toLocaleDateString()}</td>
  </tr>
));

// Memoized summary card component
const SummaryCard = React.memo(({ title, value }) => (
  <div className="summary-card">
    <h3>{title}</h3>
    <span>{value.toLocaleString()}</span>
  </div>
));

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

  const axiosConfig = {
    headers: {
      'Content-Type': 'application/json',
      'Origin': APP_DOMAIN,
      'Accept': 'application/json'
    },
    withCredentials: true
  };

  // Debounce workspace change with shorter delay
  const debouncedWorkspaceChange = useCallback((value) => {
    setSelectedWorkspace(value);
  }, []);

  // Debounce status filter change with shorter delay
  const debouncedStatusChange = useCallback((value) => {
    setStatusFilter(value);
  }, []);

  // Debounce date range change with shorter delay
  const debouncedDateChange = useCallback((newRange) => {
    setDateRange(newRange);
  }, []);

  // Fetch workspaces
  const fetchWorkspaces = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await axios.get(`${API_BASE_URL}/api/workspaces`, axiosConfig);
      const workspaceData = response.data;
      
      if (!Array.isArray(workspaceData)) {
        throw new Error('Invalid workspace data received');
      }
      
      setWorkspaces(workspaceData);
      
      // Set default workspace if none selected
      if (workspaceData.length > 0 && !selectedWorkspace) {
        setSelectedWorkspace(workspaceData[0]._id);
      }
    } catch (error) {
      console.error('Error fetching workspaces:', error);
      setError(error.response?.data?.details || error.message);
    } finally {
      setLoading(false);
    }
  }, [selectedWorkspace]);

  // Fetch campaign data
  const fetchCampaigns = useCallback(async () => {
    if (!selectedWorkspace) return;
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/campaign-stats`, {
        params: {
          workspaceId: selectedWorkspace,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          status: statusFilter !== 'ALL' ? statusFilter : undefined
        },
        ...axiosConfig
      });
      setCampaigns(response.data);
    } catch (err) {
      console.error('Error fetching campaigns:', err);
      setError(err.response?.data?.error || 'Failed to fetch campaigns');
    } finally {
      setLoading(false);
    }
  }, [selectedWorkspace, dateRange, statusFilter, API_BASE_URL]);

  const sortCampaigns = useCallback((data) => {
    return [...data].sort((a, b) => {
      let compareA = a[sortBy];
      let compareB = b[sortBy];

      if (sortBy === 'created_at') {
        compareA = new Date(compareA).getTime();
        compareB = new Date(compareB).getTime();
      } 
      else if (typeof compareA === 'number' && typeof compareB === 'number') {
        // Keep as is
      }
      else if (typeof compareA === 'string' && typeof compareB === 'string') {
        compareA = compareA.toLowerCase();
        compareB = compareB.toLowerCase();
      }

      if (compareA === null || compareA === undefined) return 1;
      if (compareB === null || compareB === undefined) return -1;

      return (sortOrder === 'asc' ? 1 : -1) * (compareA > compareB ? 1 : compareA < compareB ? -1 : 0);
    });
  }, [sortBy, sortOrder]);

  // Memoize stats calculation
  const stats = useMemo(() => {
    const totalContacted = campaigns.reduce((sum, camp) => sum + (camp.lead_contacted_count || 0), 0);
    const positiveReplies = campaigns.reduce((sum, camp) => sum + (camp.positive_reply_count || 0), 0);
    
    return {
      totalContacted,
      totalReplies: campaigns.reduce((sum, camp) => sum + (camp.replied_count || 0), 0),
      positiveReplies,
      activeCampaigns: campaigns.filter(camp => camp.status === 'ACTIVE').length,
      leadRate: totalContacted ? ((positiveReplies / totalContacted) * 100).toFixed(1) + '%' : '0%'
    };
  }, [campaigns]);

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  // Add debounce to data fetching
  useEffect(() => {
    const fetchTimeout = setTimeout(() => {
      fetchCampaigns();
    }, 300); // 300ms debounce

    return () => clearTimeout(fetchTimeout);
  }, [selectedWorkspace, statusFilter, dateRange]);

  const handleSort = useCallback((field) => {
    setSortBy(prevSort => {
      const newOrder = field === prevSort && sortOrder === 'desc' ? 'asc' : 'desc';
      setSortOrder(newOrder);
      return field;
    });
    setCampaigns(prev => sortCampaigns([...prev]));
  }, [sortOrder, sortCampaigns]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="app">
      <header className="header">
        <h1>Campaign Statistics</h1>
        
        <div className="filters">
          <div className="filter-group">
            <label>Workspace:</label>
            <select 
              value={selectedWorkspace} 
              onChange={(e) => debouncedWorkspaceChange(e.target.value)}
              disabled={loading}
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
              onChange={(e) => debouncedStatusChange(e.target.value)}
              disabled={loading}
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
              onChange={(e) => debouncedDateChange({ ...dateRange, startDate: e.target.value })}
              disabled={loading}
            />
            <span>to</span>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => debouncedDateChange({ ...dateRange, endDate: e.target.value })}
              disabled={loading}
            />
          </div>
        </div>
      </header>
      
      <main className="main">
        <div className="stats-summary">
          <SummaryCard title="Total Contacted" value={stats.totalContacted} />
          <SummaryCard title="Total Replies in Date Range" value={stats.totalReplies} />
          <SummaryCard title="Positive Replies in Date Range" value={stats.positiveReplies} />
          <SummaryCard title="Lead Rate" value={stats.leadRate} />
          <SummaryCard title="Active Campaigns in Date Range" value={stats.activeCampaigns} />
        </div>

        <div className="table-container">
          {loading ? (
            <div className="loading-overlay">
              <div className="loading-spinner"></div>
              <div>Loading campaigns...</div>
            </div>
          ) : error ? (
            <div className="error-message">{error}</div>
          ) : campaigns.length === 0 ? (
            <div className="no-data-message">No campaigns found for the selected filters</div>
          ) : (
            <table className="campaigns-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('camp_name')} className="sortable" data-sort={sortBy === 'camp_name' ? sortOrder : ''}>
                    Campaign Name
                  </th>
                  <th>Status</th>
                  <th onClick={() => handleSort('lead_contacted_count')} className="sortable" data-sort={sortBy === 'lead_contacted_count' ? sortOrder : ''}>
                    Contacted
                  </th>
                  <th onClick={() => handleSort('completed_lead_count')} className="sortable" data-sort={sortBy === 'completed_lead_count' ? sortOrder : ''}>
                    Completed
                  </th>
                  <th onClick={() => handleSort('lead_count')} className="sortable" data-sort={sortBy === 'lead_count' ? sortOrder : ''}>
                    Leads
                  </th>
                  <th onClick={() => handleSort('sent_count')} className="sortable" data-sort={sortBy === 'sent_count' ? sortOrder : ''}>
                    Sent
                  </th>
                  <th onClick={() => handleSort('replied_count')} className="sortable" data-sort={sortBy === 'replied_count' ? sortOrder : ''}>
                    Replies
                  </th>
                  <th onClick={() => handleSort('positive_reply_count')} className="sortable" data-sort={sortBy === 'positive_reply_count' ? sortOrder : ''}>
                    Positive Replies
                  </th>
                  <th onClick={() => handleSort('bounced_count')} className="sortable" data-sort={sortBy === 'bounced_count' ? sortOrder : ''}>
                    Bounced
                  </th>
                  <th onClick={() => handleSort('unsubscribed_count')} className="sortable" data-sort={sortBy === 'unsubscribed_count' ? sortOrder : ''}>
                    Unsubscribed
                  </th>
                  <th onClick={() => handleSort('created_at')} className="sortable" data-sort={sortBy === 'created_at' ? sortOrder : ''}>
                    Created At
                  </th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map(campaign => (
                  <TableRow key={campaign._id} campaign={campaign} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
