#!/usr/bin/env python3
"""
Memory Analysis Tool for Zoned Extension

Analyzes memory-*.csv files from stability tests and generates
interactive visualizations to help identify memory leaks.

Usage:
    python analyze-memory.py results/memory-*.csv
    python analyze-memory.py results/memory-*.csv --longhaul results/longhaul-*.csv
    python analyze-memory.py results/memory-*.csv --output report.html

Requirements:
    pip install plotly pandas
"""

import argparse
import sys
from pathlib import Path
from datetime import datetime

try:
    import pandas as pd
    import plotly.graph_objects as go
    from plotly.subplots import make_subplots
except ImportError:
    print("Error: Required packages not installed")
    print("Install with: pip install plotly pandas")
    sys.exit(1)


# Test name to color mapping for consistency
TEST_COLORS = {
    'Enable/Disable': '#e74c3c',
    'UI Stress': '#3498db',
    'Zone Cycling': '#2ecc71',
    'Layout Switching': '#f39c12',
    'Combined Stress': '#9b59b6',
    'Multi-Monitor': '#1abc9c',
    'Window Movement': '#e67e22',
    'Edge Cases': '#95a5a6',
    'Workspace': '#34495e',
    'idle': '#ecf0f1',
    'unknown': '#bdc3c7',
}


def load_memory_csv(filepath):
    """Load memory CSV file with proper column names."""
    df = pd.read_csv(filepath)
    
    # Convert timestamp to datetime for better plotting
    df['datetime'] = pd.to_datetime(df['timestamp'], unit='s')
    
    # Calculate elapsed time in minutes
    df['elapsed_min'] = (df['timestamp'] - df['timestamp'].min()) / 60
    
    return df


def load_longhaul_csv(filepath):
    """Load longhaul CSV file."""
    df = pd.read_csv(filepath)
    df['datetime'] = pd.to_datetime(df['timestamp'], unit='s')
    return df


def create_memory_timeline(df, title="Memory Over Time"):
    """Create interactive timeline of memory usage."""
    fig = make_subplots(
        rows=3, cols=1,
        shared_xaxes=True,
        vertical_spacing=0.05,
        subplot_titles=(
            'GNOME Shell RSS Memory',
            'GJS Memory Breakdown',
            'Resource Tracker Leaks'
        ),
        row_heights=[0.4, 0.4, 0.2]
    )
    
    # Row 1: Shell RSS memory with test phases highlighted
    fig.add_trace(
        go.Scatter(
            x=df['elapsed_min'],
            y=df['shell_rss_kb'] / 1024,  # Convert to MB
            name='Shell RSS',
            line=dict(color='#2c3e50', width=2),
            hovertemplate='<b>Shell RSS</b><br>Time: %{x:.1f}m<br>Memory: %{y:.1f}MB<br>Test: %{text}<extra></extra>',
            text=df['test_name']
        ),
        row=1, col=1
    )
    
    # Add background colors for test phases
    add_test_phase_backgrounds(fig, df, row=1)
    
    # Row 2: GJS memory components
    fig.add_trace(
        go.Scatter(
            x=df['elapsed_min'],
            y=df['gjs_rss_kb'] / 1024,
            name='GJS RSS',
            line=dict(color='#3498db'),
            stackgroup='gjs'
        ),
        row=2, col=1
    )
    
    fig.add_trace(
        go.Scatter(
            x=df['elapsed_min'],
            y=df['gjs_shared_kb'] / 1024,
            name='GJS Shared',
            line=dict(color='#2ecc71'),
            stackgroup='gjs'
        ),
        row=2, col=1
    )
    
    # Row 3: Resource tracker leaks
    fig.add_trace(
        go.Scatter(
            x=df['elapsed_min'],
            y=df['leaked_signals'],
            name='Leaked Signals',
            line=dict(color='#e74c3c', width=2),
            mode='lines+markers'
        ),
        row=3, col=1
    )
    
    fig.add_trace(
        go.Scatter(
            x=df['elapsed_min'],
            y=df['leaked_timers'],
            name='Leaked Timers',
            line=dict(color='#f39c12', width=2),
            mode='lines+markers'
        ),
        row=3, col=1
    )
    
    # Update layout
    fig.update_xaxes(title_text="Time (minutes)", row=3, col=1)
    fig.update_yaxes(title_text="Memory (MB)", row=1, col=1)
    fig.update_yaxes(title_text="Memory (MB)", row=2, col=1)
    fig.update_yaxes(title_text="Count", row=3, col=1)
    
    fig.update_layout(
        title=title,
        height=900,
        hovermode='x unified',
        showlegend=True,
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1)
    )
    
    return fig


def add_test_phase_backgrounds(fig, df, row):
    """Add colored background rectangles for each test phase."""
    current_test = None
    start_time = None
    
    for i, row_data in df.iterrows():
        test = row_data['test_name']
        time = row_data['elapsed_min']
        
        if test != current_test:
            # End previous phase
            if current_test is not None:
                fig.add_vrect(
                    x0=start_time,
                    x1=time,
                    fillcolor=TEST_COLORS.get(current_test, '#ecf0f1'),
                    opacity=0.2,
                    layer="below",
                    line_width=0,
                    row=row, col=1
                )
            
            # Start new phase
            current_test = test
            start_time = time
    
    # Add final phase
    if current_test is not None:
        fig.add_vrect(
            x0=start_time,
            x1=df['elapsed_min'].max(),
            fillcolor=TEST_COLORS.get(current_test, '#ecf0f1'),
            opacity=0.2,
            layer="below",
            line_width=0,
            row=row, col=1
        )


def create_per_test_analysis(df):
    """Create bar chart showing memory growth per test."""
    # Group by test and calculate statistics
    test_stats = df.groupby('test_name').agg({
        'shell_rss_kb': ['min', 'max', 'mean'],
        'leaked_signals': 'max',
        'leaked_timers': 'max'
    }).reset_index()
    
    # Flatten column names
    test_stats.columns = ['test_name', 'min_rss', 'max_rss', 'avg_rss', 'max_leaked_signals', 'max_leaked_timers']
    
    # Calculate memory delta
    test_stats['delta_mb'] = (test_stats['max_rss'] - test_stats['min_rss']) / 1024
    
    # Sort by delta
    test_stats = test_stats.sort_values('delta_mb', ascending=False)
    
    # Create subplot with 2 charts
    fig = make_subplots(
        rows=1, cols=2,
        subplot_titles=('Memory Growth Per Test', 'Resource Leaks Per Test'),
        specs=[[{"type": "bar"}, {"type": "bar"}]]
    )
    
    # Memory growth chart
    colors = [TEST_COLORS.get(test, '#95a5a6') for test in test_stats['test_name']]
    
    fig.add_trace(
        go.Bar(
            x=test_stats['test_name'],
            y=test_stats['delta_mb'],
            name='Memory Delta',
            marker_color=colors,
            hovertemplate='<b>%{x}</b><br>Growth: %{y:.1f}MB<extra></extra>'
        ),
        row=1, col=1
    )
    
    # Resource leaks chart
    fig.add_trace(
        go.Bar(
            x=test_stats['test_name'],
            y=test_stats['max_leaked_signals'],
            name='Leaked Signals',
            marker_color='#e74c3c'
        ),
        row=1, col=2
    )
    
    fig.add_trace(
        go.Bar(
            x=test_stats['test_name'],
            y=test_stats['max_leaked_timers'],
            name='Leaked Timers',
            marker_color='#f39c12'
        ),
        row=1, col=2
    )
    
    fig.update_xaxes(tickangle=-45, row=1, col=1)
    fig.update_xaxes(tickangle=-45, row=1, col=2)
    fig.update_yaxes(title_text="Memory Growth (MB)", row=1, col=1)
    fig.update_yaxes(title_text="Leak Count", row=1, col=2)
    
    fig.update_layout(height=500, showlegend=True)
    
    return fig, test_stats


def create_summary_table(df, test_stats):
    """Create summary statistics table."""
    # Calculate overall statistics
    total_time = (df['timestamp'].max() - df['timestamp'].min()) / 60  # minutes
    total_growth = (df['shell_rss_kb'].iloc[-1] - df['shell_rss_kb'].iloc[0]) / 1024  # MB
    max_leaked_signals = df['leaked_signals'].max()
    max_leaked_timers = df['leaked_timers'].max()
    
    summary_html = f"""
    <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>Memory Analysis Summary</h2>
        <table style="border-collapse: collapse; width: 100%;">
            <tr style="background-color: #f2f2f2;">
                <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Metric</th>
                <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Value</th>
            </tr>
            <tr>
                <td style="border: 1px solid #ddd; padding: 8px;">Total Test Duration</td>
                <td style="border: 1px solid #ddd; padding: 8px;">{total_time:.1f} minutes</td>
            </tr>
            <tr>
                <td style="border: 1px solid #ddd; padding: 8px;">Total Memory Growth</td>
                <td style="border: 1px solid #ddd; padding: 8px; color: {'red' if total_growth > 50 else 'green'};">
                    {total_growth:.1f} MB
                </td>
            </tr>
            <tr>
                <td style="border: 1px solid #ddd; padding: 8px;">Max Leaked Signals</td>
                <td style="border: 1px solid #ddd; padding: 8px; color: {'red' if max_leaked_signals > 0 else 'green'};">
                    {max_leaked_signals}
                </td>
            </tr>
            <tr>
                <td style="border: 1px solid #ddd; padding: 8px;">Max Leaked Timers</td>
                <td style="border: 1px solid #ddd; padding: 8px; color: {'red' if max_leaked_timers > 0 else 'green'};">
                    {max_leaked_timers}
                </td>
            </tr>
            <tr>
                <td style="border: 1px solid #ddd; padding: 8px;">Samples Collected</td>
                <td style="border: 1px solid #ddd; padding: 8px;">{len(df)}</td>
            </tr>
        </table>
        
        <h3 style="margin-top: 30px;">Tests with Highest Memory Growth</h3>
        <table style="border-collapse: collapse; width: 100%;">
            <tr style="background-color: #f2f2f2;">
                <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Test Name</th>
                <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Memory Delta (MB)</th>
                <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Leaked Signals</th>
                <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Leaked Timers</th>
            </tr>
    """
    
    for _, row in test_stats.head(5).iterrows():
        color = 'red' if row['delta_mb'] > 10 else 'orange' if row['delta_mb'] > 5 else 'green'
        summary_html += f"""
            <tr>
                <td style="border: 1px solid #ddd; padding: 8px;">{row['test_name']}</td>
                <td style="border: 1px solid #ddd; padding: 8px; color: {color};">{row['delta_mb']:.1f} MB</td>
                <td style="border: 1px solid #ddd; padding: 8px;">{int(row['max_leaked_signals'])}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">{int(row['max_leaked_timers'])}</td>
            </tr>
        """
    
    summary_html += """
        </table>
    </div>
    """
    
    return summary_html


def generate_report(memory_file, longhaul_file=None, output_file=None):
    """Generate HTML report with interactive visualizations."""
    print(f"Loading memory data from: {memory_file}")
    df = load_memory_csv(memory_file)
    
    print(f"Loaded {len(df)} samples spanning {df['elapsed_min'].max():.1f} minutes")
    
    # Create visualizations
    print("Generating timeline visualization...")
    timeline_fig = create_memory_timeline(df)
    
    print("Analyzing per-test statistics...")
    test_fig, test_stats = create_per_test_analysis(df)
    
    print("Creating summary...")
    summary_html = create_summary_table(df, test_stats)
    
    # Combine into HTML report
    if output_file is None:
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        output_file = f"memory-analysis-{timestamp}.html"
    
    print(f"Writing report to: {output_file}")
    
    with open(output_file, 'w') as f:
        f.write(f"""
<!DOCTYPE html>
<html>
<head>
    <title>Zoned Memory Analysis Report</title>
    <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
</head>
<body>
    <div style="max-width: 1400px; margin: 0 auto;">
        <h1 style="text-align: center; font-family: Arial, sans-serif;">
            Zoned Extension - Memory Analysis Report
        </h1>
        <p style="text-align: center; color: #666; font-family: Arial, sans-serif;">
            Generated: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}<br>
            Source: {memory_file}
        </p>
        
        {summary_html}
        
        <div id="timeline"></div>
        <div id="per-test"></div>
        
        <script>
            {timeline_fig.to_html(include_plotlyjs=False, div_id="timeline")}
            {test_fig.to_html(include_plotlyjs=False, div_id="per-test")}
        </script>
        
        <div style="margin-top: 50px; padding: 20px; background-color: #f9f9f9; font-family: Arial, sans-serif;">
            <h3>How to Use This Report</h3>
            <ul>
                <li><b>Timeline Chart</b>: Hover over lines to see exact values. Colored backgrounds show test phases.</li>
                <li><b>Memory Growth Chart</b>: Identify which tests cause the most memory growth.</li>
                <li><b>Resource Leaks</b>: Red/orange bars indicate ResourceTracker detected unreleased resources.</li>
                <li><b>Zoom</b>: Click and drag on any chart to zoom in. Double-click to reset.</li>
            </ul>
            <h3>Next Steps</h3>
            <ol>
                <li>Focus on tests with highest memory delta and/or leaked resources</li>
                <li>Enable debug logging: <code>gsettings set org.gnome.shell.extensions.zoned debug-logging true</code></li>
                <li>Run single test: <code>make vm-test-single TEST=&lt;test-name&gt;</code></li>
                <li>Check logs for ResourceTracker warnings about specific components</li>
                <li>Inspect the code paths in those components for missing cleanup</li>
            </ol>
        </div>
    </div>
</body>
</html>
        """)
    
    print(f"\n✓ Report generated successfully!")
    print(f"  Open in browser: file://{Path(output_file).absolute()}")
    
    return output_file


def main():
    parser = argparse.ArgumentParser(description='Analyze Zoned extension memory usage')
    parser.add_argument('memory_csv', help='Path to memory-*.csv file')
    parser.add_argument('--longhaul', help='Path to longhaul-*.csv file (optional)')
    parser.add_argument('--output', '-o', help='Output HTML file (default: auto-generated)')
    
    args = parser.parse_args()
    
    if not Path(args.memory_csv).exists():
        print(f"Error: File not found: {args.memory_csv}")
        sys.exit(1)
    
    try:
        generate_report(args.memory_csv, args.longhaul, args.output)
    except Exception as e:
        print(f"Error generating report: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
