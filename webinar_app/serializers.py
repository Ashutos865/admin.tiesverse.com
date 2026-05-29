from rest_framework import serializers
from .models import WebinarEvent, RegistrationForm, CalendarEvent

class WebinarEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = WebinarEvent
        fields = '__all__'

class RegistrationFormSerializer(serializers.ModelSerializer):
    class Meta:
        model = RegistrationForm
        fields = '__all__'

class CalendarEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = CalendarEvent
        fields = '__all__'
