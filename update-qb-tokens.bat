@echo off
echo Updating QuickBooks tokens in Supabase...
echo.

set SUPABASE_ACCESS_TOKEN=sbp_c0133df1e3a3152c6e50103dd1159df921d85909
set PROJECT_REF=migcpasmtbdojqphqyzc

cd /d "%~dp0"

echo [1/2] Updating QB Access Token...
call npx supabase secrets set QB_ACCESS_TOKEN=eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2IiwieC5vcmciOiJIMCJ9..YMPjzfSZmOgaxS_ZzkFlvA.m2NX91Wo8Kd-WPQ_YnEWmlariqmY5HoUUi9hK3DFQYj27SINwKHPtWH6UhSYZuSBZdSRaVv1Km9Wa_f5_4F3XS6oSQTrwrOB1adu4Vi397OqBEslComgHMNmylsdVHmNNcMHnMP4hMZ58w6S4VUiQ2Jjz5xP-QPPZxMyu54gzkAbaG8O81sRu-wv84VZ_IX_j94EKIWveZgujxJRIJ-ua3MQfwsTE3XiUayu9m_OVTzV8O9slXMGVqO7ud7SETE2Z6pKBkrG3O_NLGXpEempTyrkLxaXdbfp_dH0CvV7msApyDr4WaI14LdfJApTsWZsFVA65UlFKDcupLpsRLZz2lIJVwtfonbtugpRdbo2NjSYE289GiVu5PsypRhKdr0Ez9TL4quRhzQB2j2EjIhqAfHHfGTDDbDmicfimR4zohRGdJOVof_e3vZBJulmrrdMRwjGtYd6YJAwNGo64qhD51Gq4ncK0bUTe1Vy8NjiQsY8uRM-8XfyxqlWvk4wz0V9YNIb-SUt4PP5if4UsJrICf6JW22T5ZWbHgttwVdP_HLYSOgGDSP3QE2XwSPVaGiXP3FG3eD7jfKb3WIA6Y0kGRu8IBXsM66zX6GVVOTNq09HUX7tYMRMAepFFDNBE48B.Di8mpR8ARE0IMCeM5y67YQ --project-ref %PROJECT_REF%

echo.
echo [2/2] Updating QB Refresh Token...
call npx supabase secrets set QB_REFRESH_TOKEN=RT1-163-H0-17784422571bsxjoycjm9prfn5zxoj --project-ref %PROJECT_REF%

echo.
echo ========================================
echo Tokens updated successfully!
echo ========================================
echo.
pause
