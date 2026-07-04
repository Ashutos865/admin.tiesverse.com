from rest_framework import serializers
from .models import WebinarEvent, RegistrationForm, CalendarEvent, EventFormQuestion

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

class EventFormQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = EventFormQuestion
        fields = '__all__'
