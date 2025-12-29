#!/bin/bash
#
# test-correlation.sh - Standalone test for correlation analysis
#
# Tests the correlation calculation logic in isolation with sample data

# Sample data from your actual runs
NUMERIC_CYCLES=(136 272 408 544)
NUMERIC_DEVIATION=("+19.0" "+15.6" "+25.2" "+20.1")

echo "Testing Correlation Analysis with Sample Data"
echo "=============================================="
echo ""
echo "Sample Data:"
for i in $(seq 0 $((${#NUMERIC_CYCLES[@]} - 1))); do
    echo "  Run $((i+1)): ${NUMERIC_CYCLES[$i]} cycles, deviation ${NUMERIC_DEVIATION[$i]} MB"
done
echo ""
echo "Running Correlation Analysis..."
echo ""

# Calculate correlation using simple linear regression
sum_x=0
sum_y=0
sum_xy=0
sum_x2=0
n=${#NUMERIC_CYCLES[@]}

for i in $(seq 0 $((n - 1))); do
    x=${NUMERIC_CYCLES[$i]}
    # Strip leading + sign from deviation if present
    y=$(echo "${NUMERIC_DEVIATION[$i]}" | sed 's/^+//')
    echo "  Processing: x=$x, y=$y (stripped from ${NUMERIC_DEVIATION[$i]})"
    sum_x=$(echo "$sum_x + $x" | bc -l)
    sum_y=$(echo "$sum_y + $y" | bc -l)
    xy=$(echo "$x * $y" | bc -l)
    sum_xy=$(echo "$sum_xy + $xy" | bc -l)
    x2=$(echo "$x * $x" | bc -l)
    sum_x2=$(echo "$sum_x2 + $x2" | bc -l)
done

echo ""
echo "Sums calculated:"
echo "  sum_x = $sum_x"
echo "  sum_y = $sum_y"
echo "  sum_xy = $sum_xy"
echo "  sum_x2 = $sum_x2"
echo ""

# Calculate slope (MB per cycle)
n_sum_xy=$(echo "$n * $sum_xy" | bc -l)
sum_x_sum_y=$(echo "$sum_x * $sum_y" | bc -l)
numerator=$(echo "$n_sum_xy - $sum_x_sum_y" | bc -l)

n_sum_x2=$(echo "$n * $sum_x2" | bc -l)
sum_x_squared=$(echo "$sum_x * $sum_x" | bc -l)
denominator=$(echo "$n_sum_x2 - $sum_x_squared" | bc -l)

echo "Slope calculation:"
echo "  numerator = $numerator"
echo "  denominator = $denominator"
echo ""

if (( $(echo "$denominator != 0" | bc -l) )); then
    slope=$(echo "scale=6; $numerator / $denominator" | bc -l)
    slope_per_100=$(echo "scale=3; $slope * 100" | bc -l)
    
    echo "  slope = $slope MB/cycle"
    echo "  slope_per_100 = $slope_per_100 MB/100 cycles"
    echo ""
    
    # Calculate R-squared for correlation strength
    avg_y=$(echo "scale=3; $sum_y / $n" | bc -l)
    avg_x=$(echo "scale=3; $sum_x / $n" | bc -l)
    slope_avg_x=$(echo "$slope * $avg_x" | bc -l)
    intercept=$(echo "scale=3; $avg_y - $slope_avg_x" | bc -l)
    
    echo "R² calculation:"
    echo "  avg_x = $avg_x"
    echo "  avg_y = $avg_y"
    echo "  intercept = $intercept"
    echo ""
    
    ss_tot=0
    ss_res=0
    for i in $(seq 0 $((n - 1))); do
        x=${NUMERIC_CYCLES[$i]}
        # Strip leading + sign from deviation if present
        y=$(echo "${NUMERIC_DEVIATION[$i]}" | sed 's/^+//')
        
        slope_x=$(echo "$slope * $x" | bc -l)
        y_pred=$(echo "scale=3; $intercept + $slope_x" | bc -l)
        
        y_diff=$(echo "$y - $avg_y" | bc -l)
        y_diff_sq=$(echo "$y_diff * $y_diff" | bc -l)
        ss_tot=$(echo "$ss_tot + $y_diff_sq" | bc -l)
        
        res=$(echo "$y - $y_pred" | bc -l)
        res_sq=$(echo "$res * $res" | bc -l)
        ss_res=$(echo "$ss_res + $res_sq" | bc -l)
        
        echo "  Point $((i+1)): y=$y, y_pred=$y_pred, residual=$res"
    done
    
    echo ""
    echo "  ss_tot = $ss_tot"
    echo "  ss_res = $ss_res"
    echo ""
    
    if (( $(echo "$ss_tot != 0" | bc -l) )); then
        ss_ratio=$(echo "scale=6; $ss_res / $ss_tot" | bc -l)
        r_squared=$(echo "scale=3; 1 - $ss_ratio" | bc -l)
    else
        r_squared=0
    fi
    
    echo "=============================================="
    echo "FINAL RESULTS:"
    echo "=============================================="
    printf "  Per-cycle leak rate: %+.3f MB/100 cycles (R²=%.3f)\n" "$slope_per_100" "$r_squared"
    echo ""
    
    # Interpret correlation
    if (( $(echo "$r_squared > 0.8" | bc -l) )); then
        if (( $(echo "$slope_per_100 > 0.5" | bc -l) )); then
            echo "  ⚠ Strong correlation: Per-cycle leak detected"
        elif (( $(echo "$slope_per_100 > 0.1" | bc -l) )); then
            echo "  ⚠ Weak correlation: Possible small leak"
        else
            echo "  ✓ Strong correlation but negligible rate"
        fi
    else
        echo "  ✓ No correlation: Variability is measurement noise"
    fi
    echo ""
else
    echo "ERROR: Division by zero"
fi
